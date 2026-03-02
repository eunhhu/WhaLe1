# frida-rust Full Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all Frida stubs in tauri-runtime with real frida-rust calls, add config-driven script registration, and wire up the example app with a session module.

**Architecture:** FridaManager holds frida-rust objects (Frida, DeviceManager) in a dedicated thread (non-Send types). Tauri commands communicate via channel. SDK hooks unchanged (same IPC interface). whale.config.ts gains a `frida` section for declarative script registration.

**Tech Stack:** frida 0.17 (auto-download), tauri 2, solid-js, rdev (fufesou fork)

---

### Task 1: Add frida crate dependency

**Files:**
- Modify: `packages/tauri-runtime/Cargo.toml`

**Step 1: Add frida dependency with auto-download**

```toml
# Add under [dependencies]:
frida = { version = "0.17", features = ["auto-download"] }
```

The final `[dependencies]` section should be:
```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
rdev = { git = "https://github.com/fufesou/rdev" }
frida = { version = "0.17", features = ["auto-download"] }
```

**Step 2: Verify it compiles**

Run: `cd /Users/sunwoo/work/WhaLe && cargo check -p whale-tauri-runtime`
Expected: Compilation succeeds (first run will download Frida devkit automatically)

**Step 3: Commit**

```bash
git add packages/tauri-runtime/Cargo.toml Cargo.lock
git commit -m "feat(tauri-runtime): add frida crate with auto-download"
```

---

### Task 2: Rewrite FridaManager with dedicated thread

**Files:**
- Modify: `packages/tauri-runtime/src/state/frida_state.rs`

**Context:** frida-rust types (`Frida`, `DeviceManager`, `Session`, `Script`) are NOT `Send`. They must live on a single dedicated thread. We use a channel-based pattern: FridaManager holds a `Sender` to send requests to the Frida thread, which holds all actual frida objects.

**Step 1: Write the new FridaManager**

Replace entire content of `frida_state.rs`:

```rust
use std::collections::HashMap;
use std::sync::Mutex;
use std::thread;
use serde::Serialize;
use tokio::sync::oneshot;

/// Request types sent to the Frida worker thread
pub enum FridaRequest {
    ListDevices {
        reply: oneshot::Sender<Result<Vec<DeviceInfoData>, String>>,
    },
    EnumerateProcesses {
        device_id: String,
        reply: oneshot::Sender<Result<Vec<ProcessInfoData>, String>>,
    },
    Spawn {
        device_id: String,
        program: String,
        reply: oneshot::Sender<Result<u32, String>>,
    },
    Resume {
        device_id: String,
        pid: u32,
        reply: oneshot::Sender<Result<(), String>>,
    },
    Attach {
        device_id: String,
        pid: u32,
        reply: oneshot::Sender<Result<String, String>>,
    },
    LoadScript {
        session_id: String,
        code: String,
        reply: oneshot::Sender<Result<String, String>>,
    },
    UnloadScript {
        script_id: String,
        reply: oneshot::Sender<Result<(), String>>,
    },
    Detach {
        session_id: String,
        reply: oneshot::Sender<Result<(), String>>,
    },
}

#[derive(Serialize, Clone, Debug)]
pub struct DeviceInfoData {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct ProcessInfoData {
    pub pid: u32,
    pub name: String,
}

/// FridaManager — channel-based bridge to a dedicated Frida thread
pub struct FridaManager {
    sender: std::sync::mpsc::Sender<FridaRequest>,
}

// Safety: FridaManager only holds a Sender which is Send.
// All non-Send frida objects live on the worker thread.
unsafe impl Send for FridaManager {}
unsafe impl Sync for FridaManager {}

impl FridaManager {
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        let (tx, rx) = std::sync::mpsc::channel::<FridaRequest>();

        thread::spawn(move || {
            let frida = unsafe { frida::Frida::obtain() };
            let device_manager = frida::DeviceManager::obtain(&frida);
            let mut sessions: HashMap<String, frida::Session<'_>> = HashMap::new();
            let mut scripts: HashMap<String, frida::Script<'_>> = HashMap::new();
            let mut script_counter: u64 = 0;

            log::info!("[whale:frida] worker thread started, frida {}", frida::Frida::version());

            while let Ok(req) = rx.recv() {
                match req {
                    FridaRequest::ListDevices { reply } => {
                        log::info!("[whale:frida] listing devices...");
                        let devices = device_manager.enumerate_all_devices();
                        let infos: Vec<DeviceInfoData> = devices.iter().map(|d| {
                            DeviceInfoData {
                                id: d.get_id().to_string(),
                                name: d.get_name().to_string(),
                                kind: format!("{:?}", d.get_type()).to_lowercase(),
                            }
                        }).collect();
                        log::info!("[whale:frida] found {} devices", infos.len());
                        let _ = reply.send(Ok(infos));
                    }
                    FridaRequest::EnumerateProcesses { device_id, reply } => {
                        log::info!("[whale:frida] enumerating processes on {}", device_id);
                        let result = (|| -> Result<Vec<ProcessInfoData>, String> {
                            let device = device_manager.get_device_by_id(&device_id)
                                .map_err(|e| format!("Device not found: {}", e))?;
                            let procs = device.enumerate_processes();
                            Ok(procs.iter().map(|p| ProcessInfoData {
                                pid: p.get_pid(),
                                name: p.get_name().to_string(),
                            }).collect())
                        })();
                        let _ = reply.send(result);
                    }
                    FridaRequest::Spawn { device_id, program, reply } => {
                        log::info!("[whale:frida] spawning {} on {}", program, device_id);
                        let result = (|| -> Result<u32, String> {
                            let mut device = device_manager.get_device_by_id(&device_id)
                                .map_err(|e| format!("Device not found: {}", e))?;
                            let options = frida::SpawnOptions::new();
                            let pid = device.spawn(&program, &options)
                                .map_err(|e| format!("Spawn failed: {}", e))?;
                            log::info!("[whale:frida] spawned pid {}", pid);
                            Ok(pid)
                        })();
                        let _ = reply.send(result);
                    }
                    FridaRequest::Resume { device_id, pid, reply } => {
                        log::info!("[whale:frida] resuming pid {} on {}", pid, device_id);
                        let result = (|| -> Result<(), String> {
                            let device = device_manager.get_device_by_id(&device_id)
                                .map_err(|e| format!("Device not found: {}", e))?;
                            device.resume(pid)
                                .map_err(|e| format!("Resume failed: {}", e))
                        })();
                        let _ = reply.send(result);
                    }
                    FridaRequest::Attach { device_id, pid, reply } => {
                        log::info!("[whale:frida] attaching to pid {} on {}", pid, device_id);
                        let result = (|| -> Result<String, String> {
                            let device = device_manager.get_device_by_id(&device_id)
                                .map_err(|e| format!("Device not found: {}", e))?;
                            let session = device.attach(pid)
                                .map_err(|e| format!("Attach failed: {}", e))?;
                            let session_id = format!("session_{}_{}", device_id, pid);
                            log::info!("[whale:frida] attached session_id={}", session_id);
                            sessions.insert(session_id.clone(), session);
                            Ok(session_id)
                        })();
                        let _ = reply.send(result);
                    }
                    FridaRequest::LoadScript { session_id, code, reply } => {
                        log::info!("[whale:frida] loading script ({} bytes) on {}", code.len(), session_id);
                        let result = (|| -> Result<String, String> {
                            let session = sessions.get(&session_id)
                                .ok_or_else(|| format!("Session not found: {}", session_id))?;
                            let mut options = frida::ScriptOption::new();
                            let mut script = session.create_script(&code, &mut options)
                                .map_err(|e| format!("Create script failed: {}", e))?;

                            // Set up message handler for bridge integration
                            let app = app_handle.clone();
                            script.handle_message(ScriptMessageHandler { app })
                                .map_err(|e| format!("Handle message failed: {}", e))?;

                            script.load()
                                .map_err(|e| format!("Script load failed: {}", e))?;

                            script_counter += 1;
                            let script_id = format!("script_{}_{}", session_id, script_counter);
                            log::info!("[whale:frida] script loaded: {}", script_id);
                            scripts.insert(script_id.clone(), script);
                            Ok(script_id)
                        })();
                        let _ = reply.send(result);
                    }
                    FridaRequest::UnloadScript { script_id, reply } => {
                        log::info!("[whale:frida] unloading script {}", script_id);
                        let result = if let Some(script) = scripts.remove(&script_id) {
                            script.unload().map_err(|e| format!("Unload failed: {}", e))
                        } else {
                            Err(format!("Script not found: {}", script_id))
                        };
                        let _ = reply.send(result);
                    }
                    FridaRequest::Detach { session_id, reply } => {
                        log::info!("[whale:frida] detaching session {}", session_id);
                        let result = if let Some(session) = sessions.remove(&session_id) {
                            // Also remove associated scripts
                            let script_ids: Vec<String> = scripts.keys()
                                .filter(|k| k.starts_with(&format!("script_{}_", session_id)))
                                .cloned().collect();
                            for sid in script_ids {
                                if let Some(s) = scripts.remove(&sid) {
                                    let _ = s.unload();
                                }
                            }
                            session.detach().map_err(|e| format!("Detach failed: {}", e))
                        } else {
                            Err(format!("Session not found: {}", session_id))
                        };
                        let _ = reply.send(result);
                    }
                }
            }

            log::info!("[whale:frida] worker thread exiting");
        });

        Self { sender: tx }
    }

    pub fn send(&self, req: FridaRequest) {
        let _ = self.sender.send(req);
    }
}

/// ScriptHandler implementation that forwards messages to bridge.rs
struct ScriptMessageHandler {
    app: tauri::AppHandle,
}

impl frida::ScriptHandler for ScriptMessageHandler {
    fn on_message(&mut self, message: frida::Message, _data: Option<Vec<u8>>) {
        // Convert frida::Message to serde_json::Value and forward to bridge
        let json_str = match message {
            frida::Message::Send(payload) => payload,
            frida::Message::Log(level, text) => {
                log::info!("[whale:frida:script] [{}] {}", level, text);
                return;
            }
            _ => return,
        };
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&json_str) {
            crate::bridge::handle_frida_message(&self.app, &value);
        }
    }
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/sunwoo/work/WhaLe && cargo check -p whale-tauri-runtime`
Expected: May have compile errors — address in next step. The key point is the architecture is correct.

Note: `frida::Message` enum variants and exact API may need adjustment based on actual frida 0.17 API. The implementer should check `frida::Message` variants and adapt accordingly.

**Step 3: Commit**

```bash
git add packages/tauri-runtime/src/state/frida_state.rs
git commit -m "feat(tauri-runtime): rewrite FridaManager with dedicated worker thread"
```

---

### Task 3: Rewrite frida_cmd.rs with real frida-rust calls

**Files:**
- Modify: `packages/tauri-runtime/src/commands/frida_cmd.rs`

**Context:** All commands now send requests to FridaManager's worker thread via channel and await reply.

**Step 1: Rewrite frida_cmd.rs**

Replace entire content:

```rust
use crate::state::frida_state::{DeviceInfoData, FridaManager, FridaRequest, ProcessInfoData};
use crate::state::store_state::StoreManager;
use crate::preamble;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::oneshot;

/// Helper: send request and await reply
async fn request<T>(
    frida: &FridaManager,
    make_req: impl FnOnce(oneshot::Sender<Result<T, String>>) -> FridaRequest,
) -> Result<T, String> {
    let (tx, rx) = oneshot::channel();
    frida.send(make_req(tx));
    rx.await.map_err(|_| "Frida worker thread not responding".to_string())?
}

#[tauri::command]
pub async fn frida_list_devices(
    frida_manager: State<'_, FridaManager>,
) -> Result<Vec<DeviceInfoData>, String> {
    request(&frida_manager, |reply| FridaRequest::ListDevices { reply }).await
}

#[tauri::command]
pub async fn frida_enumerate_processes(
    frida_manager: State<'_, FridaManager>,
    device_id: String,
) -> Result<Vec<ProcessInfoData>, String> {
    request(&frida_manager, |reply| FridaRequest::EnumerateProcesses { device_id, reply }).await
}

#[tauri::command]
pub async fn frida_spawn(
    frida_manager: State<'_, FridaManager>,
    device_id: String,
    program: String,
) -> Result<u32, String> {
    request(&frida_manager, |reply| FridaRequest::Spawn { device_id, program, reply }).await
}

#[tauri::command]
pub async fn frida_resume(
    frida_manager: State<'_, FridaManager>,
    device_id: String,
    pid: u32,
) -> Result<(), String> {
    request(&frida_manager, |reply| FridaRequest::Resume { device_id, pid, reply }).await
}

#[tauri::command]
pub async fn frida_attach(
    frida_manager: State<'_, FridaManager>,
    device_id: String,
    pid: u32,
) -> Result<String, String> {
    request(&frida_manager, |reply| FridaRequest::Attach { device_id, pid, reply }).await
}

#[tauri::command]
pub async fn frida_load_script(
    frida_manager: State<'_, FridaManager>,
    store_manager: State<'_, StoreManager>,
    session_id: String,
    code: String,
    store_name: Option<String>,
) -> Result<String, String> {
    // Prepend __whale_store__ preamble if store_name provided
    let final_code = if let Some(ref name) = store_name {
        let initial_state = store_manager
            .get(name)
            .map(|s| serde_json::to_string(&s).unwrap_or_default())
            .unwrap_or_else(|| "{}".to_string());
        let preamble_code = preamble::generate(name, &initial_state);
        format!("{}\n\n{}", preamble_code, code)
    } else {
        code
    };

    request(&frida_manager, |reply| FridaRequest::LoadScript {
        session_id,
        code: final_code,
        reply,
    }).await
}

#[tauri::command]
pub async fn frida_load_script_file(
    frida_manager: State<'_, FridaManager>,
    store_manager: State<'_, StoreManager>,
    session_id: String,
    path: String,
    store_name: Option<String>,
) -> Result<String, String> {
    let code = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read script file {}: {}", path, e))?;
    // Re-use frida_load_script logic manually (can't call Tauri command from command)
    let final_code = if let Some(ref name) = store_name {
        let initial_state = store_manager
            .get(name)
            .map(|s| serde_json::to_string(&s).unwrap_or_default())
            .unwrap_or_else(|| "{}".to_string());
        let preamble_code = preamble::generate(name, &initial_state);
        format!("{}\n\n{}", preamble_code, code)
    } else {
        code
    };

    request(&frida_manager, |reply| FridaRequest::LoadScript {
        session_id,
        code: final_code,
        reply,
    }).await
}

#[tauri::command]
pub async fn frida_unload_script(
    frida_manager: State<'_, FridaManager>,
    script_id: String,
) -> Result<(), String> {
    request(&frida_manager, |reply| FridaRequest::UnloadScript { script_id, reply }).await
}

#[tauri::command]
pub async fn frida_detach(
    app: AppHandle,
    frida_manager: State<'_, FridaManager>,
    session_id: String,
) -> Result<(), String> {
    let result = request(&frida_manager, |reply| FridaRequest::Detach {
        session_id: session_id.clone(),
        reply,
    }).await;
    if result.is_ok() {
        let _ = app.emit(
            "frida:session-detached",
            serde_json::json!({ "sessionId": session_id }),
        );
    }
    result
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/sunwoo/work/WhaLe && cargo check -p whale-tauri-runtime`

**Step 3: Commit**

```bash
git add packages/tauri-runtime/src/commands/frida_cmd.rs
git commit -m "feat(tauri-runtime): rewrite frida commands with real frida-rust calls"
```

---

### Task 4: Update main.rs — Frida initialization & new commands

**Files:**
- Modify: `packages/tauri-runtime/src/main.rs`

**Step 1: Update main.rs**

Changes:
1. Remove old `FridaManager::new()` (no args) — now requires `AppHandle`
2. Move FridaManager creation into `.setup()` callback (needs app handle)
3. Register new commands: `frida_enumerate_processes`, `frida_resume`, `frida_unload_script`
4. Add `log` crate init if not already present

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bridge;
mod commands;
mod preamble;
mod state;

use tauri::Manager;

use state::input_state::InputManager;
use state::store_state::StoreManager;
use state::frida_state::FridaManager;

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .manage(InputManager::new())
        .invoke_handler(tauri::generate_handler![
            // Store
            commands::store_cmd::store_register,
            commands::store_cmd::store_get,
            commands::store_cmd::store_set,
            commands::store_cmd::store_get_all,
            commands::store_cmd::store_subscribe,
            commands::store_cmd::store_unsubscribe,
            commands::store_cmd::store_get_persist_enabled,
            commands::store_cmd::store_set_persist_enabled,
            // Window
            commands::window_cmd::window_show,
            commands::window_cmd::window_hide,
            commands::window_cmd::window_toggle,
            commands::window_cmd::window_close,
            commands::window_cmd::window_set_position,
            commands::window_cmd::window_set_size,
            commands::window_cmd::window_set_always_on_top,
            commands::window_cmd::window_center,
            commands::window_cmd::window_is_visible,
            commands::window_cmd::window_create,
            // Input (rdev)
            commands::input_cmd::input_register_hotkey,
            commands::input_cmd::input_unregister_hotkey,
            commands::input_cmd::input_simulate_key_press,
            commands::input_cmd::input_simulate_key_down,
            commands::input_cmd::input_simulate_key_up,
            commands::input_cmd::input_simulate_mouse_click,
            commands::input_cmd::input_simulate_mouse_move,
            // Frida
            commands::frida_cmd::frida_list_devices,
            commands::frida_cmd::frida_enumerate_processes,
            commands::frida_cmd::frida_spawn,
            commands::frida_cmd::frida_resume,
            commands::frida_cmd::frida_attach,
            commands::frida_cmd::frida_load_script,
            commands::frida_cmd::frida_load_script_file,
            commands::frida_cmd::frida_unload_script,
            commands::frida_cmd::frida_detach,
        ])
        .setup(|app| {
            // Store persistence
            let persist_path = app
                .path()
                .app_data_dir()
                .ok()
                .map(|dir| dir.join("whale_stores.json"));
            let store_manager = StoreManager::new(persist_path);
            store_manager.start_persist_loop();
            app.manage(store_manager);

            // Frida worker thread (needs app handle for message bridging)
            let frida_manager = FridaManager::new(app.handle().clone());
            app.manage(frida_manager);

            // rdev input listener
            let input_manager = app.state::<InputManager>();
            input_manager.start_listener(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Also add to Cargo.toml:
```toml
log = "0.4"
env_logger = "0.11"
```

**Step 2: Verify it compiles**

Run: `cd /Users/sunwoo/work/WhaLe && cargo check -p whale-tauri-runtime`

**Step 3: Commit**

```bash
git add packages/tauri-runtime/src/main.rs packages/tauri-runtime/Cargo.toml
git commit -m "feat(tauri-runtime): init Frida worker in setup, register new commands"
```

---

### Task 5: Add FridaConfig to CLI config types

**Files:**
- Modify: `packages/cli/src/config.ts`

**Step 1: Add FridaConfig type**

Add to config.ts:

```typescript
export interface FridaScriptConfig {
  entry: string
  store?: string
}

export interface FridaConfig {
  scripts?: FridaScriptConfig[]
}
```

Update `WhaleConfig`:

```typescript
export interface WhaleConfig {
  app: AppConfig
  windows: Record<string, WindowConfig & { entry: string }>
  store?: { persist?: boolean; persistPath?: string }
  build?: BuildConfig
  frida?: FridaConfig
}
```

**Step 2: Verify types compile**

Run: `cd /Users/sunwoo/work/WhaLe && bun run --filter @whale/cli build`

**Step 3: Commit**

```bash
git add packages/cli/src/config.ts
git commit -m "feat(cli): add FridaConfig type to WhaleConfig"
```

---

### Task 6: Update SDK types and hooks

**Files:**
- Modify: `packages/sdk/src/types.ts`
- Modify: `packages/sdk/src/hooks/useDevice.ts`
- Modify: `packages/sdk/src/hooks/useSession.ts`
- Modify: `packages/sdk/src/index.ts`

**Step 1: Add Process type to types.ts**

Add after `Script` interface:

```typescript
export interface Process {
  pid: number
  name: string
}
```

**Step 2: Add enumerateProcesses to useDevice.ts**

Add import of `Process` type. Add to `DeviceHandle` interface:

```typescript
export interface DeviceHandle {
  device: Accessor<Device | null>
  status: Accessor<'searching' | 'connected' | 'disconnected'>
  spawn(program: string, opts?: SpawnOptions): Promise<Session>
  attach(pid: number): Promise<Session>
  enumerateProcesses(): Promise<Process[]>
  resume(pid: number): Promise<void>
}
```

Add implementations:

```typescript
const enumerateProcesses = async (): Promise<Process[]> => {
  const dev = device()
  if (!dev) throw new Error('No device connected')
  console.log('[whale:sdk] useDevice: enumerating processes on', dev.name)
  const procs = await safeInvoke<Process[]>('frida_enumerate_processes', { deviceId: dev.id })
  return procs ?? []
}

const resume = async (pid: number): Promise<void> => {
  const dev = device()
  if (!dev) throw new Error('No device connected')
  console.log('[whale:sdk] useDevice: resuming pid', pid)
  await safeInvokeVoid('frida_resume', { deviceId: dev.id, pid })
}
```

Also update `spawn` to use `program` instead of `bundleId`:

```typescript
const spawn = async (program: string, opts?: SpawnOptions): Promise<Session> => {
  const dev = device()
  if (!dev) throw new Error('No device connected')
  console.log('[whale:sdk] useDevice: spawning', program, 'on', dev.name)
  const pid = await safeInvoke<number>('frida_spawn', { deviceId: dev.id, program, ...(opts || {}) })
  if (typeof pid !== 'number') throw new Error('Failed to spawn process')
  const sessionId = await safeInvoke<string>('frida_attach', { deviceId: dev.id, pid })
  if (!sessionId) throw new Error('Failed to attach session')
  return { id: sessionId, pid }
}
```

Add logging to `attach`:

```typescript
const attach = async (pid: number): Promise<Session> => {
  const dev = device()
  if (!dev) throw new Error('No device connected')
  console.log('[whale:sdk] useDevice: attaching to pid', pid, 'on', dev.name)
  const sessionId = await safeInvoke<string>('frida_attach', { deviceId: dev.id, pid })
  if (!sessionId) throw new Error('Failed to attach session')
  console.log('[whale:sdk] useDevice: attached, session_id=', sessionId)
  return { id: sessionId, pid }
}
```

Return `{ device, status, spawn, attach, enumerateProcesses, resume }`.

Add logging to `findDevice`:

```typescript
const findDevice = async () => {
  try {
    setStatus('searching')
    console.log('[whale:sdk] useDevice: searching for device...', filter)
    const devices = (await safeInvoke<Device[]>('frida_list_devices')) ?? []
    console.log('[whale:sdk] useDevice: found', devices.length, 'devices')
    const found = devices.find((d) => {
      if (filter?.id && d.id !== filter.id) return false
      if (filter?.type && d.type !== filter.type) return false
      return true
    })
    if (found) {
      setDevice(found)
      setStatus('connected')
      console.log('[whale:sdk] useDevice: connected to', found.name)
    } else {
      setStatus('disconnected')
      console.log('[whale:sdk] useDevice: no matching device found')
    }
  } catch {
    setStatus('disconnected')
  }
}
```

**Step 3: Update useSession.ts — add loadScript by name & unload**

Add to `SessionHandle`:

```typescript
export interface SessionHandle {
  status: Accessor<'attached' | 'detached'>
  loadScript(code: string, storeName?: string): Promise<Script>
  loadScriptFile(path: string, storeName?: string): Promise<Script>
  unloadScript(scriptId: string): Promise<void>
  detach(): void
}
```

Update implementations:

```typescript
loadScript: async (code: string, storeName?: string) => {
  console.log('[whale:sdk] useSession: loading script on', session.id, storeName ? `(store: ${storeName})` : '')
  const scriptId = await safeInvoke<string>('frida_load_script', {
    sessionId: session.id,
    code,
    storeName: storeName ?? null,
  })
  if (!scriptId) throw new Error('Failed to load script')
  console.log('[whale:sdk] useSession: script loaded:', scriptId)
  return { id: scriptId }
},
loadScriptFile: async (path: string, storeName?: string) => {
  console.log('[whale:sdk] useSession: loading script file', path, 'on', session.id)
  const scriptId = await safeInvoke<string>('frida_load_script_file', {
    sessionId: session.id,
    path,
    storeName: storeName ?? null,
  })
  if (!scriptId) throw new Error('Failed to load script file')
  console.log('[whale:sdk] useSession: script loaded:', scriptId)
  return { id: scriptId }
},
unloadScript: async (scriptId: string) => {
  console.log('[whale:sdk] useSession: unloading script', scriptId)
  await safeInvokeVoid('frida_unload_script', { scriptId })
},
```

**Step 4: Update SDK index.ts exports**

Add `Process` to type exports:

```typescript
export type { ..., Process } from './types'
```

**Step 5: Verify SDK builds**

Run: `cd /Users/sunwoo/work/WhaLe && bun run --filter @whale/sdk build`

**Step 6: Commit**

```bash
git add packages/sdk/src/types.ts packages/sdk/src/hooks/useDevice.ts packages/sdk/src/hooks/useSession.ts packages/sdk/src/index.ts
git commit -m "feat(sdk): add enumerateProcesses, resume, unloadScript, logging"
```

---

### Task 7: Frida script tsconfig separation

**Files:**
- Create: `apps/example/src/script/tsconfig.json`
- Modify: `apps/example/src/script/hooks/main.ts` — remove `/// <reference>`
- Delete: `apps/example/src/script/types.ts`
- Modify: `apps/example/tsconfig.json` — exclude script dir

**Step 1: Create script-specific tsconfig**

Create `apps/example/src/script/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "lib": ["ES2020"],
    "types": ["frida-gum"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["./**/*.ts"]
}
```

**Step 2: Update main.ts — remove reference directive**

Remove line 1 (`/// <reference types="frida-gum" />`) and line 2 (`import '../types'`) from `apps/example/src/script/hooks/main.ts`.

The `__whale_store__` global type will be auto-generated (Task 8 handles the type generation based on store defaults).

Result:

```typescript
const gameTick = Module.getGlobalExportByName('game_tick')

Interceptor.attach(gameTick, {
  onEnter(_args: InvocationArguments) {
    if (__whale_store__.godMode) {
      // Example: patch health to max
    }
    if (__whale_store__.speedHack !== 1.0) {
      // Example: modify game speed
    }
  },
})
```

**Step 3: Delete types.ts**

Delete: `apps/example/src/script/types.ts`

**Step 4: Exclude script dir from main tsconfig**

In `apps/example/tsconfig.json`, add exclude:

```json
{
  "exclude": ["src/script"]
}
```

(Exact change depends on current tsconfig content.)

**Step 5: Install frida-gum types**

Run: `cd /Users/sunwoo/work/WhaLe && bun add -D @anthropic-ai/frida-gum-types` or check if `@types/frida-gum` is available:

Run: `cd /Users/sunwoo/work/WhaLe/apps/example && bun add -D @types/frida-gum`

**Step 6: Commit**

```bash
git add apps/example/src/script/tsconfig.json apps/example/tsconfig.json
git rm apps/example/src/script/types.ts
git add apps/example/src/script/hooks/main.ts
git commit -m "feat(example): separate tsconfig for Frida scripts, remove manual types"
```

---

### Task 8: Auto-generate __whale_store__ type declaration

**Files:**
- Create: `apps/example/src/script/whale-store.d.ts`

**Context:** Instead of manually maintaining `types.ts`, generate a `.d.ts` that declares `__whale_store__` based on the store defaults from `store/trainer.ts`. For now, create a simple hand-written `.d.ts` that matches the store shape — full auto-generation from config can be a future CLI feature.

**Step 1: Create whale-store.d.ts**

```typescript
// Auto-generated type for __whale_store__ (matches createSyncStore defaults in store/trainer.ts)
// This file is included via src/script/tsconfig.json

interface WhaleStore {
  speedHack: number
  godMode: boolean
  infiniteAmmo: boolean
  noRecoil: boolean
  fov: number
  set<K extends keyof WhaleStore>(key: K, value: WhaleStore[K]): void
}

declare const __whale_store__: WhaleStore
```

**Step 2: Update script tsconfig to include the declaration**

The `"include": ["./**/*.ts"]` in `src/script/tsconfig.json` already covers `.d.ts` files. Verify by running:

Run: `cd /Users/sunwoo/work/WhaLe/apps/example && npx tsc -p src/script/tsconfig.json --noEmit`

**Step 3: Commit**

```bash
git add apps/example/src/script/whale-store.d.ts
git commit -m "feat(example): add whale-store type declaration for Frida scripts"
```

---

### Task 9: Add whale.config.ts frida section & example session module

**Files:**
- Modify: `apps/example/whale.config.ts`
- Create: `apps/example/src/frida/session.ts`
- Modify: `apps/example/src/ui/windows/main.tsx`

**Step 1: Update whale.config.ts**

Add `frida` section:

```typescript
import { defineConfig } from '@whale/cli'

export default defineConfig({
  app: {
    name: 'Example Trainer',
    version: '0.1.0',
    identifier: 'com.whale.example',
    icon: '../../assets/icon.png',
  },
  windows: {
    main: {
      entry: './src/ui/windows/main.tsx',
      width: 400,
      height: 500,
      resizable: false,
    },
    overlay: {
      entry: './src/ui/windows/overlay.tsx',
      width: 300,
      height: 200,
      transparent: true,
      decorations: false,
      alwaysOnTop: true,
      skipTaskbar: true,
    },
    settings: {
      entry: './src/ui/windows/settings.tsx',
      width: 500,
      height: 400,
      visible: false,
    },
  },
  frida: {
    scripts: [
      { entry: './src/script/hooks/main.ts', store: 'trainer' },
    ],
  },
  store: {
    persist: true,
  },
})
```

**Step 2: Create session module**

Create `apps/example/src/frida/session.ts`:

```typescript
import { createEffect } from 'solid-js'
import { useDevice, useSession } from '@whale/sdk'

/**
 * Setup Frida session for trainer.
 * Connects to local device, attaches to target process, loads trainer script.
 *
 * Call this inside a SolidJS reactive root (e.g., from main.tsx).
 */
export function setupTrainerSession() {
  const device = useDevice({ type: 'local' })

  createEffect(() => {
    const dev = device.device()
    const status = device.status()

    if (status !== 'connected' || !dev) return

    console.log('[trainer] device connected:', dev.name)
    console.log('[trainer] to attach: use device.attach(pid) from console or extend this module')

    // Example: list processes
    device.enumerateProcesses().then((procs) => {
      console.log('[trainer] running processes:', procs.length)
      procs.slice(0, 10).forEach((p) => {
        console.log(`  [${p.pid}] ${p.name}`)
      })
    })
  })

  return { device }
}
```

**Step 3: Wire up main.tsx**

Add import and call at top of Main component:

```typescript
import { setupTrainerSession } from '../../frida/session'

export default function Main() {
  const { device } = setupTrainerSession()
  // ... rest of existing code unchanged
```

**Step 4: Verify frontend builds**

Run: `cd /Users/sunwoo/work/WhaLe/apps/example && WHALE_SKIP_TAURI=1 bun run build` (or equivalent frontend-only build)

**Step 5: Commit**

```bash
git add apps/example/whale.config.ts apps/example/src/frida/session.ts apps/example/src/ui/windows/main.tsx
git commit -m "feat(example): add frida config section and session module"
```

---

### Task 10: Add log crate and verify full build

**Files:**
- Modify: `packages/tauri-runtime/Cargo.toml` (if not already done in Task 4)

**Step 1: Ensure log + env_logger are in Cargo.toml**

```toml
log = "0.4"
env_logger = "0.11"
```

**Step 2: Run full build**

Run: `cd /Users/sunwoo/work/WhaLe && bun run build`

Fix any compile errors that arise. Common issues:
- frida-rust API differences from what we assumed (Message enum variants, method names)
- Lifetime issues with frida objects in the worker thread
- Missing `use` imports

**Step 3: Run Rust tests**

Run: `cd /Users/sunwoo/work/WhaLe && cargo test -p whale-tauri-runtime`

Ensure existing preamble and bridge tests still pass.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: complete frida-rust integration, verify full build"
```
