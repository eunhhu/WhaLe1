# WhaLe Architecture

## Table of Contents

1. [System Overview](#system-overview)
2. [Module Map](#module-map)
3. [Data Flow](#data-flow)
4. [Store Synchronization](#store-synchronization)
5. [Preamble Injection](#preamble-injection)
6. [Selective Emit](#selective-emit)
7. [Store Persistence](#store-persistence)

---

## System Overview

WhaLe runs as a single native process built on Tauri. There is no separate backend server; all subsystems live inside the same OS process.

```
+-------------------------------------------------------+
|                    Tauri Process                      |
|                                                       |
|  +----------------+  +------------+  +------------+  |
|  |  StoreManager  |  | FridaManager|  | InputManager|  |
|  | (app state)    |  | (sessions) |  | (rdev)     |  |
|  +----------------+  +------------+  +------------+  |
|                                                       |
|  IPC layer: tauri::command + tauri::emit              |
|                                                       |
|  +----------+  +----------+  +----------+            |
|  | WebView  |  | WebView  |  | WebView  |  ...       |
|  | (window) |  | (window) |  | (window) |            |
|  +----------+  +----------+  +----------+            |
+-------------------------------------------------------+
         |
         | Frida IPC (send / recv)
         v
+---------------------+
|  Target Process     |
|  (injected script)  |
|  __whale_store__    |
+---------------------+
```

The three Tauri-managed state objects are registered at startup in `main.rs` and shared across all IPC commands via Tauri's type-indexed state mechanism (`app.manage(...)` / `State<'_, T>`).

---

## Module Map

### `packages/tauri-runtime` (Rust)

| File | Responsibility |
|---|---|
| `src/main.rs` | Entry point. Registers state managers, registers all IPC handlers, starts the persist loop and input listener. |
| `src/state/store_state.rs` | `StoreManager` — in-memory store map, subscription registry, dirty flag, and persistence logic. |
| `src/state/frida_state.rs` | `FridaManager` — session and script registry. Acts as a facade over frida-rust (which is behind a feature flag). |
| `src/state/input_state.rs` | `InputManager` — wraps rdev for global hotkey listening and input simulation. |
| `src/commands/store_cmd.rs` | Tauri IPC commands for store operations: `store_register`, `store_get`, `store_set`, `store_get_all`, `store_subscribe`, `store_unsubscribe`. |
| `src/commands/frida_cmd.rs` | Tauri IPC commands for Frida lifecycle: `frida_list_devices`, `frida_spawn`, `frida_attach`, `frida_load_script`, `frida_load_script_file`, `frida_detach`. Injects preamble on script load. |
| `src/commands/window_cmd.rs` | Tauri IPC commands for window management: show, hide, toggle, close, position, size, always-on-top, create. |
| `src/commands/input_cmd.rs` | Tauri IPC commands for hotkey registration and input simulation. |
| `src/bridge.rs` | `handle_frida_message` — processes `send()` messages from Frida scripts, identifies `__whale` marker messages, applies `merge_patch` to `StoreManager`, and emits `store:changed`. |
| `src/preamble.rs` | `generate(store_name, initial_state_json)` — produces the `__whale_store__` IIFE injected at the top of every Frida script. |

### `packages/sdk` (TypeScript)

| File | Responsibility |
|---|---|
| `src/store.ts` | `createSyncStore<T>` — creates a SolidJS reactive store, registers it with Rust, subscribes the current window to its keys, listens for `store:changed` events, and exposes a `setXxx` Proxy API. |
| `src/types.ts` | Shared TypeScript types: `SyncStore<T>`, `WindowConfig`, `Device`, `Session`, `Script`, error classes. |
| `src/hooks/useHotkey.ts` | Wraps `input_register_hotkey` / `input_unregister_hotkey` commands. |
| `src/hooks/useSimulate.ts` | Wraps input simulation commands (key press, mouse move, mouse click). |
| `src/hooks/useWindow.ts` | Wraps window management commands for a named window. |
| `src/hooks/useCurrentWindow.ts` | Wraps window commands scoped to the current WebView window. |
| `src/hooks/useDevice.ts` | Wraps `frida_list_devices` and `frida_attach`. |
| `src/hooks/useDevices.ts` | Reactive list of Frida devices. |
| `src/hooks/useSession.ts` | Wraps `frida_load_script`, `frida_load_script_file`, `frida_detach`. |
| `src/index.ts` | Public re-exports for the SDK package. |

---

## Data Flow

Three independent paths converge on `StoreManager` and fan out to subscribed WebView windows.

```
UI Window (WebView)
  |
  |  1. store.setSpeed(2.0)          [Proxy intercepts setXxx]
  |     -> invoke('store_set', {name, key, value})
  |
  v
Tauri IPC boundary
  |
  v
store_cmd.rs :: store_set()
  |
  |  2. StoreManager::set(name, key, value)
  |     -> marks dirty flag
  |     -> returns patch {key: value}
  |
  |  3. StoreManager::get_subscribed_windows(name, changed_keys)
  |     -> returns [window_labels] interested in changed keys
  |
  |  4. app.emit_to(label, "store:changed", {store, patch})
  |     for each subscribed window
  |     (broadcasts to all if no subscriptions registered)
  |
  v
Target UI Window(s) (WebView)
  |
  |  5. listen('store:changed', event => ...)
  |     -> produce((s) => { s[key] = value })
  |     -> SolidJS reactive graph updated
  v
  DOM re-render


Frida Script (target process)
  |
  |  A. __whale_store__.set('hp', 999)
  |     -> marks 'hp' dirty
  |     -> schedules _flush via setTimeout(16ms)
  |
  |  B. _flush() fires
  |     -> send({ __whale: true, store: 'trainer', patch: {hp: 999} })
  |
  v
Frida IPC (native send/recv)
  |
  v
bridge.rs :: handle_frida_message()
  |
  |  C. parse_whale_message(): validates __whale marker
  |  D. StoreManager::merge_patch(store_name, patch_map)
  |     -> marks dirty flag
  |  E. app.emit("store:changed", {store, patch})
  |     (broadcast — no subscription filtering on the Frida path)
  |
  v
All UI Windows listening on 'store:changed'
  |
  |  F. produce() -> SolidJS update
  v
  DOM re-render
```

---

## Store Synchronization

### StoreManager Internal Structure

```
StoreManager
  inner: Arc<StoreInner>
    stores:       Mutex<HashMap<store_name, HashMap<key, Value>>>
    persist_path: Option<PathBuf>
    dirty:        AtomicBool
    subscriptions: Mutex<HashMap<store_name, HashMap<window_label, Vec<key>>>>
```

The `Arc` wrapper allows the persist background thread to share ownership of `StoreInner` without cloning data.

### Path 1: UI -> Rust (store_set)

```
SDK (TypeScript)
  proxy.get('setSpeed')
    -> return (value) => {
         setStore(produce(s => { s.speed = value }))  // local reactive update (optimistic)
         invoke('store_set', { name, key: 'speed', value })
       }

store_cmd.rs :: store_set()
  store_manager.set(name, key, value)
    stores.lock() -> store.insert(key, value)
    dirty.store(true, Relaxed)
    return Some({ key: value })   // the patch

  get_subscribed_windows(name, changed_keys)
    subscriptions.lock()
    -> filter windows whose key list intersects changed_keys
    -> return Vec<window_label>

  for each label in targets:
    app.emit_to(label, "store:changed", { store: name, patch: { key: value } })
```

The local `setStore(produce(...))` in the SDK applies the change optimistically before the IPC round-trip completes. The subsequent `store:changed` event that arrives back at the originating window is harmless — it is a no-op because `produce` writes the same value.

### Path 2: Frida -> Rust (bridge)

```
Frida script (inside target process)
  __whale_store__.set('hp', 999)
    target['hp'] = 999
    _dirty.add('hp')
    if (!_timer) _timer = setTimeout(_flush, 16)

  _flush() [after 16ms]
    patch = { hp: 999 }   // only dirty keys
    _dirty.clear()
    _timer = null
    send({ __whale: true, store: 'trainer', patch })

bridge.rs :: handle_frida_message(app, message)
  parse_whale_message(message)
    -> validates obj.__whale === true
    -> extracts store name and patch HashMap
  store_manager.merge_patch(store_name, patch_map)
    stores.lock() -> for each (k,v) in patch: store.insert(k,v)
    dirty.store(true, Relaxed)
  app.emit("store:changed", { store, patch })
```

Note: The Frida path always broadcasts to all windows. Subscription filtering is only applied on the `store_set` (UI-initiated) path. This is intentional because Frida messages arrive out-of-band and the subscription registry may not yet reflect all windows that care about Frida-originated changes.

### Path 3: Rust -> UI (event listener)

```
SDK (TypeScript) :: createSyncStore()
  listen('store:changed', (event) => {
    if (event.payload.store !== name) return   // ignore other stores
    setStore(
      produce((s) => {
        for (const [key, value] of Object.entries(event.payload.patch)) {
          s[key] = value
        }
      })
    )
  })
```

`produce` from `solid-js/store` applies the patch as a mutation inside Solid's batch, triggering fine-grained reactive updates only for signals that depend on the changed keys.

---

## Preamble Injection

When `frida_load_script` or `frida_load_script_file` is called with a `store_name`, the command reads the current store snapshot from `StoreManager`, serializes it to JSON, and prepends a generated IIFE to the user script:

```
frida_cmd.rs :: frida_load_script()
  initial_state = store_manager.get(store_name)  -> JSON string
  preamble_code = preamble::generate(store_name, initial_state)
  final_code    = preamble_code + "\n\n" + user_code
  // final_code is passed to frida session.create_script()
```

The generated preamble has the following structure:

```javascript
const __whale_store__ = (() => {
  const _data  = { /* initial state snapshot */ };
  const _dirty = new Set();
  let   _timer = null;

  const _flush = () => {
    if (_dirty.size === 0) return;
    const patch = {};
    for (const k of _dirty) patch[k] = _data[k];
    _dirty.clear();
    _timer = null;
    send({ __whale: true, store: '<store_name>', patch });
  };

  // Receive runtime config pushes from Rust
  recv('config', (msg) => { Object.assign(_data, msg.payload); });

  return new Proxy(_data, {
    get(target, key) {
      if (key === 'set') {
        return (k, v) => {
          target[k] = v;
          _dirty.add(k);
          if (!_timer) _timer = setTimeout(_flush, 16);
        };
      }
      return target[key];
    },
  });
})();
```

Key design decisions:

- **IIFE scope isolation**: The entire implementation is wrapped in an immediately-invoked function expression. Nothing leaks into the global Frida script scope except the single `__whale_store__` binding.
- **Dirty set**: `_dirty` is a `Set` of key names that have been written since the last flush. Only changed keys are included in the `send()` payload, minimizing IPC traffic.
- **16ms batch window**: `setTimeout(_flush, 16)` approximates one frame (60 Hz). Multiple writes within the same frame are coalesced into a single `send()` call. The timer guard (`if (!_timer)`) ensures only one flush is scheduled at a time.
- **Initial state hydration**: The snapshot passed from `StoreManager` at script load time initializes `_data`, so the Frida script starts with the correct current values rather than defaults.
- **`recv('config')` handler**: Allows Rust to push updated values into the running script at any time via `script.post({ type: 'config', payload: { ... } })`, without requiring a script reload.

---

## Selective Emit

The subscription system prevents unnecessary cross-window IPC by targeting only the windows that have declared interest in specific store keys.

```
Subscription registry (inside StoreInner):
  subscriptions: HashMap<
    store_name,
    HashMap<window_label, Vec<key>>
  >

Example state:
  "trainer" -> {
    "overlay" -> ["speed", "hp"],
    "main"    -> ["speed"],
    "debug"   -> ["mana"],
  }
```

Registration happens automatically in `createSyncStore`:

```typescript
// SDK: createSyncStore()
const keys = Object.keys(defaults)          // all keys the store defines
invoke('store_subscribe', { name, window: windowLabel, keys })
```

Cleanup is handled in `onCleanup` (SolidJS component teardown):

```typescript
onCleanup(() => {
  unlisten.then((fn) => fn())               // remove event listener
  invoke('store_unsubscribe', { name, window: windowLabel })
})
```

Emit targeting logic in `store_set`:

```
changed_keys = ["speed"]

get_subscribed_windows("trainer", ["speed"])
  -> iterates subscriptions["trainer"]
  -> "overlay" has "speed" in its key list  -> include
  -> "main"    has "speed" in its key list  -> include
  -> "debug"   does NOT have "speed"        -> exclude
  -> return ["overlay", "main"]

app.emit_to("overlay", "store:changed", payload)
app.emit_to("main",    "store:changed", payload)
// "debug" window receives nothing
```

Fallback behavior: if `get_subscribed_windows` returns an empty list (no subscriptions have been registered for the store yet), `store_set` falls back to `app.emit(...)`, which broadcasts to all windows. This maintains backward compatibility during the window initialization window before `store_subscribe` has been called.

---

## Store Persistence

Store data is persisted to `<app_data_dir>/whale_stores.json` using a background thread with a debounce mechanism based on an atomic dirty flag.

```
Startup sequence (main.rs):
  persist_path = app.path().app_data_dir() / "whale_stores.json"
  store_manager = StoreManager::new(Some(persist_path))
    -> if file exists: deserialize JSON into stores HashMap
    -> dirty = AtomicBool::new(false)
  store_manager.start_persist_loop()
    -> spawns background thread
  app.manage(store_manager)
```

Persist loop (background thread):

```
loop {
    thread::sleep(Duration::from_millis(500))
    if dirty.swap(false, Relaxed) {       // atomic test-and-clear
        stores.lock()
        -> serde_json::to_string_pretty(&stores)
        -> fs::write(persist_path, data)
    }
}
```

Dirty flag lifecycle:

```
Write path (set or merge_patch):
  dirty.store(true, Relaxed)

Persist thread (every 500ms):
  dirty.swap(false, Relaxed) -> true  -> write file, clear flag
  dirty.swap(false, Relaxed) -> false -> skip, no disk I/O

flush() (immediate, on-demand):
  if dirty.swap(false, Relaxed):
      persist()
```

Properties of this design:

- **No lock contention on reads**: The `AtomicBool` dirty flag is read and cleared by the persist thread without holding the `stores` Mutex. The Mutex is only acquired for the actual serialization.
- **At-most-once writes per 500ms interval**: No matter how many `set` or `merge_patch` calls occur within the window, the disk write happens at most once.
- **Durability on shutdown**: `flush()` can be called synchronously when a controlled shutdown is detected, ensuring the final state is written even if the 500ms timer has not fired.
- **Idempotent file format**: The file is pretty-printed JSON (`serde_json::to_string_pretty`), making it human-readable and diff-friendly.
- **Load on first boot**: `StoreManager::new` reads and deserializes the file at construction time, restoring all store namespaces and their values before any UI window opens. `register` uses `HashMap::entry(...).or_insert(defaults)`, so persisted values take precedence over code-supplied defaults.
