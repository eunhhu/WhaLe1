# Whale Dev Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Chrome DevTools처럼 모든 Whale 앱에 내장되는 디버깅 윈도우 — Console, Store Inspector, Input Monitor, Events 탭 제공

**Architecture:** CLI가 dev 모드에서 `__devtools__` 윈도우를 자동 주입하고, Rust 런타임이 `devtools:log` / `input:key-event` 이벤트를 emit하며, SDK에 내장된 SolidJS DevTools UI가 이를 수신하여 렌더링. F12 핫키로 토글.

**Tech Stack:** Rust (Tauri), SolidJS, TypeScript, @whale/ui components

---

## Task 1: Rust — StoreManager에 list_all 메서드 추가

**Files:**
- Modify: `packages/tauri-runtime/src/state/store_state.rs:52-55`

**Context:** DevTools Store Inspector 탭이 모든 store를 한번에 조회해야 하므로 `list_all()` 메서드가 필요하다.

**Step 1: list_all 테스트 작성**

`store_state.rs`의 `mod tests` 블록 끝에 추가:

```rust
#[test]
fn test_list_all_returns_all_stores() {
    let mgr = StoreManager::new(None);
    let mut d1 = HashMap::new();
    d1.insert("a".to_string(), json!(1));
    mgr.register("s1", d1);

    let mut d2 = HashMap::new();
    d2.insert("b".to_string(), json!(2));
    mgr.register("s2", d2);

    let all = mgr.list_all();
    assert_eq!(all.len(), 2);
    assert_eq!(all.get("s1").unwrap().get("a"), Some(&json!(1)));
    assert_eq!(all.get("s2").unwrap().get("b"), Some(&json!(2)));
}

#[test]
fn test_list_all_empty_returns_empty() {
    let mgr = StoreManager::new(None);
    let all = mgr.list_all();
    assert!(all.is_empty());
}
```

**Step 2: 테스트 실패 확인**

Run: `cd apps/example/src-tauri && cargo test --lib store_state::tests::test_list_all`
Expected: FAIL — `list_all` method not found

**Step 3: list_all 구현**

`StoreManager` impl 블록의 `get` 메서드 다음에 추가:

```rust
pub fn list_all(&self) -> HashMap<String, HashMap<String, Value>> {
    let stores = self.inner.stores.lock().unwrap();
    stores.clone()
}
```

**Step 4: 테스트 통과 확인**

Run: `cd apps/example/src-tauri && cargo test --lib store_state::tests::test_list_all`
Expected: PASS (2 tests)

**Step 5: 커밋**

```bash
git add packages/tauri-runtime/src/state/store_state.rs
git commit -m "feat(store): add list_all method to StoreManager"
```

---

## Task 2: Rust — InputManager에 list_hotkeys 메서드 추가 + key-event emit

**Files:**
- Modify: `packages/tauri-runtime/src/state/input_state.rs`

**Context:** DevTools Input Monitor 탭이 등록된 핫키 목록을 조회하고, 모든 키 이벤트를 실시간으로 수신해야 한다.

**Step 1: HotkeyEntry에 Serialize derive 추가 및 list_hotkeys 테스트 작성**

`HotkeyEntry` struct에 `Serialize` derive 추가:
```rust
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub struct HotkeyEntry {
    pub keys: Vec<String>,
    pub id: String,
}
```

`mod tests` 블록 끝에 추가:
```rust
#[test]
fn test_list_hotkeys_returns_registered() {
    let mgr = InputManager::new();
    mgr.register_hotkey("god_mode", vec!["f1".to_string()]);
    mgr.register_hotkey("ammo", vec!["f2".to_string()]);

    let list = mgr.list_hotkeys();
    assert_eq!(list.len(), 2);
    assert_eq!(list[0].id, "god_mode");
    assert_eq!(list[1].id, "ammo");
}

#[test]
fn test_list_hotkeys_empty() {
    let mgr = InputManager::new();
    let list = mgr.list_hotkeys();
    assert!(list.is_empty());
}
```

**Step 2: 테스트 실패 확인**

Run: `cd apps/example/src-tauri && cargo test --lib input_state::tests::test_list_hotkeys`
Expected: FAIL — `list_hotkeys` method not found

**Step 3: list_hotkeys 구현**

`InputManager` impl 블록에 추가:
```rust
pub fn list_hotkeys(&self) -> Vec<HotkeyEntry> {
    let hotkeys = self.hotkeys.lock().unwrap();
    hotkeys.clone()
}
```

**Step 4: 테스트 통과 확인**

Run: `cd apps/example/src-tauri && cargo test --lib input_state::tests::test_list_hotkeys`
Expected: PASS (2 tests)

**Step 5: start_listener에 input:key-event emit 추가**

`start_listener()` 메서드의 `listen` 클로저 안, `let (key_name, is_press) = match ...` 직후에 추가:

```rust
// Emit raw key event for devtools
if cfg!(debug_assertions) {
    let _ = app_handle.emit(
        "input:key-event",
        &serde_json::json!({
            "key": &key_name,
            "pressed": is_press,
        }),
    );
}
```

주의: `serde_json` import가 이미 있는지 확인. 없으면 파일 상단에 추가 필요 없음 — `serde_json::json!` 매크로는 `serde_json` 크레이트가 의존성에 있으면 사용 가능.

**Step 6: 전체 Rust 테스트 통과 확인**

Run: `cd apps/example/src-tauri && cargo test`
Expected: ALL PASS

**Step 7: 커밋**

```bash
git add packages/tauri-runtime/src/state/input_state.rs
git commit -m "feat(input): add list_hotkeys method and key-event emit for devtools"
```

---

## Task 3: Rust — devtools Tauri 커맨드 추가

**Files:**
- Create: `packages/tauri-runtime/src/commands/devtools_cmd.rs`
- Modify: `packages/tauri-runtime/src/commands/mod.rs` (있다면) 또는 `main.rs`

**Context:** 프론트엔드가 `invoke()`로 호출할 수 있는 devtools 전용 커맨드 2개를 추가한다.

**Step 1: devtools_cmd.rs 작성**

```rust
use crate::state::input_state::InputManager;
use crate::state::store_state::StoreManager;
use serde_json::Value;
use std::collections::HashMap;
use tauri::State;

use crate::state::input_state::HotkeyEntry;

/// Return all registered stores and their current values
#[tauri::command]
pub fn devtools_list_stores(
    store_manager: State<'_, StoreManager>,
) -> HashMap<String, HashMap<String, Value>> {
    store_manager.list_all()
}

/// Return all registered hotkeys
#[tauri::command]
pub fn devtools_list_hotkeys(
    input_manager: State<'_, InputManager>,
) -> Vec<HotkeyEntry> {
    input_manager.list_hotkeys()
}
```

**Step 2: commands/mod.rs에 devtools_cmd 모듈 추가**

`packages/tauri-runtime/src/commands/` 디렉토리에 `mod.rs`가 있는지 확인. 없으면 `main.rs`에서 직접 `mod commands;`로 관리되고 있을 것이다.

현재 구조를 보면 `main.rs`에서 `mod commands;`로 선언하고 `commands::store_cmd::...` 형태로 접근한다. `commands/mod.rs`를 확인하여 `pub mod devtools_cmd;` 추가.

**Step 3: main.rs에 커맨드 등록**

`invoke_handler`의 `// Frida` 섹션 아래에 추가:
```rust
// DevTools
commands::devtools_cmd::devtools_list_stores,
commands::devtools_cmd::devtools_list_hotkeys,
```

**Step 4: 빌드 확인**

Run: `cd apps/example/src-tauri && cargo check`
Expected: no errors

**Step 5: 커밋**

```bash
git add packages/tauri-runtime/src/commands/devtools_cmd.rs packages/tauri-runtime/src/commands/mod.rs packages/tauri-runtime/src/main.rs
git commit -m "feat(devtools): add devtools_list_stores and devtools_list_hotkeys commands"
```

---

## Task 4: Rust — bridge.rs와 frida_state.rs에 devtools:log emit 추가

**Files:**
- Modify: `packages/tauri-runtime/src/bridge.rs:22-33`
- Modify: `packages/tauri-runtime/src/state/frida_state.rs` (WhaleScriptHandler)

**Context:** Frida 메시지가 도착할 때 devtools:log 이벤트를 emit하여 Console 탭에서 볼 수 있도록 한다.

**Step 1: bridge.rs에 devtools:log emit 추가**

`handle_frida_message` 함수에서 `parse_whale_message` 성공 분기와 else 분기 모두에 emit 추가:

```rust
pub fn handle_frida_message(app: &AppHandle, message: &Value) {
    // Always emit to devtools in debug mode
    if cfg!(debug_assertions) {
        let _ = app.emit("devtools:log", &serde_json::json!({
            "source": "frida",
            "level": "info",
            "message": message.to_string(),
        }));
    }

    if let Some((store_name, patch_map)) = parse_whale_message(message) {
        let store_manager = app.state::<StoreManager>();
        store_manager.merge_patch(&store_name, patch_map.clone());

        let payload = serde_json::json!({
            "store": store_name,
            "patch": patch_map,
        });
        let _ = app.emit("store:changed", &payload);
    }
}
```

**Step 2: frida_state.rs WhaleScriptHandler에 devtools:log emit 추가**

`on_message` 메서드의 `Message::Log`와 `Message::Error` 분기에 추가:

```rust
frida::Message::Log(ref log_msg) => {
    log::info!(
        "[whale:frida] script log [{}]: {}",
        format!("{:?}", log_msg.level),
        log_msg.payload
    );
    if cfg!(debug_assertions) {
        let _ = self.app.emit("devtools:log", &serde_json::json!({
            "source": "frida",
            "level": format!("{:?}", log_msg.level).to_lowercase(),
            "message": log_msg.payload.clone(),
        }));
    }
}
frida::Message::Error(ref err_msg) => {
    log::info!(
        "[whale:frida] script error: {} at {}:{}:{}",
        err_msg.description,
        err_msg.file_name,
        err_msg.line_number,
        err_msg.column_number
    );
    if cfg!(debug_assertions) {
        let _ = self.app.emit("devtools:log", &serde_json::json!({
            "source": "frida",
            "level": "error",
            "message": format!("{} at {}:{}:{}", err_msg.description, err_msg.file_name, err_msg.line_number, err_msg.column_number),
        }));
    }
}
```

**Step 3: Emitter import 확인**

`frida_state.rs` 상단에 `use tauri::Emitter;` 가 있는지 확인. 없으면 추가.

**Step 4: 빌드 확인**

Run: `cd apps/example/src-tauri && cargo check`
Expected: no errors

**Step 5: 기존 테스트 통과 확인**

Run: `cd apps/example/src-tauri && cargo test`
Expected: ALL PASS

**Step 6: 커밋**

```bash
git add packages/tauri-runtime/src/bridge.rs packages/tauri-runtime/src/state/frida_state.rs
git commit -m "feat(devtools): emit devtools:log events from frida bridge and script handler"
```

---

## Task 5: Rust — main.rs에 F12 devtools 토글 핫키 등록

**Files:**
- Modify: `packages/tauri-runtime/src/main.rs`

**Context:** dev 모드에서 F12를 누르면 `__devtools__` 윈도우를 토글한다.

**Step 1: setup 콜백에 F12 핫키 등록 및 이벤트 핸들러 추가**

`main.rs`의 `.setup(|app| {` 블록에서 `input_manager.start_listener(app.handle().clone());` 다음에 추가:

```rust
// DevTools: register F12 toggle hotkey in debug mode
if cfg!(debug_assertions) {
    input_manager.register_hotkey("__devtools_toggle__", vec!["f12".to_string()]);

    let app_handle = app.handle().clone();
    app.listen("input:hotkey-triggered", move |event| {
        if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
            if payload.get("id").and_then(|v| v.as_str()) == Some("__devtools_toggle__")
                && payload.get("phase").and_then(|v| v.as_str()) == Some("press")
            {
                if let Some(win) = app_handle.get_webview_window("__devtools__") {
                    let visible = win.is_visible().unwrap_or(false);
                    if visible {
                        let _ = win.hide();
                    } else {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            }
        }
    });
}
```

`use tauri::Listener;` import를 파일 상단에 추가 (이미 없다면).

**Step 2: 빌드 확인**

Run: `cd apps/example/src-tauri && cargo check`
Expected: no errors

**Step 3: 커밋**

```bash
git add packages/tauri-runtime/src/main.rs
git commit -m "feat(devtools): register F12 hotkey to toggle devtools window in dev mode"
```

---

## Task 6: CLI — generateTauriConf에 __devtools__ 윈도우 자동 주입

**Files:**
- Modify: `packages/cli/src/generators/tauri-conf.ts:111-149`

**Context:** dev 모드일 때 `__devtools__` 윈도우를 Tauri 설정에 자동 추가한다.

**Step 1: generateTauriConf 함수에 devtools 윈도우 주입**

`generateTauriConf` 함수의 `const windows = ...` 다음에 추가:

```typescript
// Auto-inject devtools window in development mode
if (mode === 'development') {
  windows.push({
    label: '__devtools__',
    url: '__devtools__.html',
    width: 900,
    height: 600,
    resizable: true,
    decorations: true,
    visible: false,
  })
}
```

**Step 2: 빌드 확인**

Run: `cd /Users/sunwoo/work/WhaLe && npx turbo build --filter=@whale/cli`
Expected: no errors

**Step 3: 커밋**

```bash
git add packages/cli/src/generators/tauri-conf.ts
git commit -m "feat(cli): auto-inject __devtools__ window in dev mode"
```

---

## Task 7: CLI — generateHtmlEntries에 __devtools__ 엔트리 자동 생성

**Files:**
- Modify: `packages/cli/src/generators/html-entry.ts`

**Context:** dev 모드에서 `__devtools__.html` + 부트스트랩 파일을 자동 생성하여 SDK의 DevTools 엔트리를 로드한다.

**Step 1: generateHtmlEntries에 devtools 엔트리 추가**

`generateHtmlEntries` 함수의 `for` 루프 다음 (return 전)에 추가:

```typescript
// Auto-generate devtools entry in development mode
if (mode === 'development') {
  const devtoolsBootstrapFileName = '__whale_entry___devtools__.ts'
  const devtoolsBootstrapPath = join(outDirAbs, devtoolsBootstrapFileName)
  const devtoolsBootstrap = `import { createComponent } from 'solid-js'
import { render } from 'solid-js/web'
import DevTools from '@whale/sdk/devtools'

const root = document.getElementById('root')
if (!root) {
  throw new Error('[whale] Missing #root container for "__devtools__" window')
}

render(() => createComponent(DevTools, {}), root)
`

  const devtoolsHtml = \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" href="data:," />
  <title>\${config.app.name} - DevTools</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./\${devtoolsBootstrapFileName}"></script>
</body>
</html>\`

  const devtoolsHtmlPath = join(outDirAbs, '__devtools__.html')
  writeFileSync(devtoolsBootstrapPath, devtoolsBootstrap)
  writeFileSync(devtoolsHtmlPath, devtoolsHtml)
  entries.set('__devtools__', devtoolsHtmlPath)
}
```

**Step 2: 빌드 확인**

Run: `cd /Users/sunwoo/work/WhaLe && npx turbo build --filter=@whale/cli`
Expected: no errors

**Step 3: 커밋**

```bash
git add packages/cli/src/generators/html-entry.ts
git commit -m "feat(cli): auto-generate devtools HTML entry in dev mode"
```

---

## Task 8: SDK — DevTools 엔트리 및 메인 컨테이너

**Files:**
- Create: `packages/sdk/src/devtools/entry.tsx`
- Create: `packages/sdk/src/devtools/DevTools.tsx`
- Create: `packages/sdk/src/devtools/styles.ts`
- Modify: `packages/sdk/package.json` (exports 추가)

**Context:** DevTools 윈도우의 SolidJS 엔트리포인트와 탭 컨테이너를 만든다.

**Step 1: styles.ts 작성**

```typescript
// packages/sdk/src/devtools/styles.ts
export const devtoolsStyles = {
  container: {
    display: 'flex',
    'flex-direction': 'column' as const,
    height: '100vh',
    'background-color': '#1a1a2e',
    color: '#e0e0e0',
    'font-family': "'JetBrains Mono', 'Fira Code', monospace",
    'font-size': '12px',
    overflow: 'hidden',
  },
  tabBar: {
    display: 'flex',
    gap: '0',
    'border-bottom': '1px solid #2a2a4a',
    'background-color': '#16162a',
    'padding-left': '8px',
  },
  tab: {
    padding: '8px 16px',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    color: '#888',
    'font-size': '12px',
    'font-family': 'inherit',
    'border-bottom': '2px solid transparent',
    transition: 'all 0.15s',
  },
  tabActive: {
    color: '#e0e0e0',
    'border-bottom': '2px solid #6c63ff',
  },
  panel: {
    flex: '1',
    overflow: 'auto',
    padding: '8px',
  },
} as const
```

**Step 2: DevTools.tsx 작성**

```tsx
// packages/sdk/src/devtools/DevTools.tsx
import { createSignal, type Component } from 'solid-js'
import { Console } from './Console'
import { StoreInspector } from './StoreInspector'
import { InputMonitor } from './InputMonitor'
import { EventsPanel } from './EventsPanel'
import { devtoolsStyles as s } from './styles'

type TabId = 'console' | 'store' | 'input' | 'events'

const tabs: { id: TabId; label: string }[] = [
  { id: 'console', label: 'Console' },
  { id: 'store', label: 'Store' },
  { id: 'input', label: 'Input' },
  { id: 'events', label: 'Events' },
]

const DevTools: Component = () => {
  const [activeTab, setActiveTab] = createSignal<TabId>('console')

  return (
    <div style={s.container}>
      <div style={s.tabBar}>
        {tabs.map((tab) => (
          <button
            style={{
              ...s.tab,
              ...(activeTab() === tab.id ? s.tabActive : {}),
            }}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div style={s.panel}>
        {activeTab() === 'console' && <Console />}
        {activeTab() === 'store' && <StoreInspector />}
        {activeTab() === 'input' && <InputMonitor />}
        {activeTab() === 'events' && <EventsPanel />}
      </div>
    </div>
  )
}

export default DevTools
```

**Step 3: entry.tsx 작성**

```tsx
// packages/sdk/src/devtools/entry.tsx
export { default } from './DevTools'
```

**Step 4: package.json exports 추가**

`packages/sdk/package.json`의 `"exports"` 필드에 추가:
```json
"./devtools": {
  "import": "./src/devtools/entry.tsx",
  "types": "./src/devtools/entry.tsx"
}
```

**Step 5: 타입 체크 확인**

Run: `cd /Users/sunwoo/work/WhaLe && npx turbo build --filter=@whale/sdk`
Expected: no errors (또는 Console 등 아직 없는 컴포넌트 import 에러 — 다음 태스크에서 해결)

**Step 6: 커밋**

```bash
git add packages/sdk/src/devtools/ packages/sdk/package.json
git commit -m "feat(sdk): add DevTools entry point and tab container"
```

---

## Task 9: SDK — Console 탭 컴포넌트

**Files:**
- Create: `packages/sdk/src/devtools/Console.tsx`

**Context:** `devtools:log` 이벤트를 listen하여 로그를 실시간으로 표시하는 Console 패널.

**Step 1: Console.tsx 작성**

```tsx
// packages/sdk/src/devtools/Console.tsx
import { createSignal, onMount, onCleanup, For, type Component } from 'solid-js'
import { safeListen, safeInvoke } from '../tauri'

interface LogEntry {
  id: number
  source: string
  level: string
  message: string
  timestamp: number
}

const MAX_LOGS = 1000
let logId = 0

const levelColors: Record<string, string> = {
  info: '#8be9fd',
  warn: '#f1fa8c',
  error: '#ff5555',
  debug: '#bd93f9',
}

const sourceColors: Record<string, string> = {
  frida: '#ff79c6',
  rust: '#ffb86c',
  store: '#50fa7b',
  event: '#8be9fd',
}

export const Console: Component = () => {
  const [logs, setLogs] = createSignal<LogEntry[]>([])
  const [autoScroll, setAutoScroll] = createSignal(true)
  const [levelFilter, setLevelFilter] = createSignal<Set<string>>(new Set(['info', 'warn', 'error', 'debug']))
  const [sourceFilter, setSourceFilter] = createSignal<Set<string>>(new Set(['frida', 'rust', 'store', 'event']))
  let scrollRef: HTMLDivElement | undefined

  const addLog = (entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
    const newEntry: LogEntry = {
      ...entry,
      id: ++logId,
      timestamp: Date.now(),
    }
    setLogs((prev) => {
      const next = [...prev, newEntry]
      return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next
    })
    if (autoScroll() && scrollRef) {
      requestAnimationFrame(() => {
        scrollRef!.scrollTop = scrollRef!.scrollHeight
      })
    }
  }

  onMount(async () => {
    const unlistenLog = await safeListen<{ source: string; level: string; message: string }>(
      'devtools:log',
      (event) => addLog(event.payload),
    )

    onCleanup(() => unlistenLog())
  })

  const toggleLevel = (level: string) => {
    setLevelFilter((prev) => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }

  const toggleSource = (source: string) => {
    setSourceFilter((prev) => {
      const next = new Set(prev)
      if (next.has(source)) next.delete(source)
      else next.add(source)
      return next
    })
  }

  const filteredLogs = () =>
    logs().filter(
      (l) => levelFilter().has(l.level) && sourceFilter().has(l.source),
    )

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`
  }

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '8px', padding: '4px 0', 'border-bottom': '1px solid #2a2a4a', 'align-items': 'center', 'flex-wrap': 'wrap' }}>
        <button
          onClick={() => setLogs([])}
          style={{ background: '#2a2a4a', border: 'none', color: '#e0e0e0', padding: '2px 8px', 'border-radius': '4px', cursor: 'pointer', 'font-size': '11px' }}
        >
          Clear
        </button>
        <span style={{ color: '#666', 'font-size': '11px' }}>|</span>
        {['info', 'warn', 'error', 'debug'].map((level) => (
          <button
            onClick={() => toggleLevel(level)}
            style={{
              background: levelFilter().has(level) ? levelColors[level] + '22' : 'transparent',
              border: `1px solid ${levelFilter().has(level) ? levelColors[level] : '#333'}`,
              color: levelFilter().has(level) ? levelColors[level] : '#555',
              padding: '1px 6px',
              'border-radius': '3px',
              cursor: 'pointer',
              'font-size': '10px',
            }}
          >
            {level}
          </button>
        ))}
        <span style={{ color: '#666', 'font-size': '11px' }}>|</span>
        {['frida', 'rust', 'store', 'event'].map((source) => (
          <button
            onClick={() => toggleSource(source)}
            style={{
              background: sourceFilter().has(source) ? sourceColors[source] + '22' : 'transparent',
              border: `1px solid ${sourceFilter().has(source) ? sourceColors[source] : '#333'}`,
              color: sourceFilter().has(source) ? sourceColors[source] : '#555',
              padding: '1px 6px',
              'border-radius': '3px',
              cursor: 'pointer',
              'font-size': '10px',
            }}
          >
            {source}
          </button>
        ))}
        <div style={{ 'margin-left': 'auto' }}>
          <label style={{ 'font-size': '10px', color: '#888', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoScroll()}
              onChange={(e) => setAutoScroll(e.currentTarget.checked)}
              style={{ 'margin-right': '4px' }}
            />
            Auto-scroll
          </label>
        </div>
      </div>

      {/* Log area */}
      <div ref={scrollRef} style={{ flex: '1', overflow: 'auto', 'font-size': '11px', 'line-height': '1.6' }}>
        <For each={filteredLogs()}>
          {(entry) => (
            <div style={{ display: 'flex', gap: '8px', padding: '1px 4px', 'border-bottom': '1px solid #1a1a2e' }}>
              <span style={{ color: '#555', 'min-width': '85px', 'flex-shrink': '0' }}>{formatTime(entry.timestamp)}</span>
              <span style={{ color: sourceColors[entry.source] || '#888', 'min-width': '48px', 'flex-shrink': '0' }}>[{entry.source}]</span>
              <span style={{ color: levelColors[entry.level] || '#888', 'min-width': '40px', 'flex-shrink': '0' }}>{entry.level}</span>
              <span style={{ color: entry.level === 'error' ? '#ff5555' : '#e0e0e0', 'word-break': 'break-all' }}>{entry.message}</span>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
```

**Step 2: 커밋**

```bash
git add packages/sdk/src/devtools/Console.tsx
git commit -m "feat(sdk): add DevTools Console tab component"
```

---

## Task 10: SDK — Store Inspector 탭 컴포넌트

**Files:**
- Create: `packages/sdk/src/devtools/StoreInspector.tsx`

**Context:** 모든 SyncStore의 실시간 값을 표시하고 인라인 편집이 가능한 패널.

**Step 1: StoreInspector.tsx 작성**

```tsx
// packages/sdk/src/devtools/StoreInspector.tsx
import { createSignal, onMount, onCleanup, For, type Component } from 'solid-js'
import { safeInvoke, safeListen, safeInvokeVoid } from '../tauri'

type StoreData = Record<string, Record<string, unknown>>

export const StoreInspector: Component = () => {
  const [stores, setStores] = createSignal<StoreData>({})
  const [editingKey, setEditingKey] = createSignal<string | null>(null)
  const [editValue, setEditValue] = createSignal('')
  const [flashKeys, setFlashKeys] = createSignal<Set<string>>(new Set())

  const refresh = async () => {
    const data = await safeInvoke<StoreData>('devtools_list_stores')
    if (data) setStores(data)
  }

  onMount(async () => {
    await refresh()

    const unlisten = await safeListen<{ store: string; patch: Record<string, unknown> }>(
      'store:changed',
      (event) => {
        const { store, patch } = event.payload
        setStores((prev) => ({
          ...prev,
          [store]: { ...prev[store], ...patch },
        }))

        // Flash changed keys
        const changedKeys = Object.keys(patch).map((k) => `${store}.${k}`)
        setFlashKeys((prev) => new Set([...prev, ...changedKeys]))
        setTimeout(() => {
          setFlashKeys((prev) => {
            const next = new Set(prev)
            changedKeys.forEach((k) => next.delete(k))
            return next
          })
        }, 500)
      },
    )

    onCleanup(() => unlisten())
  })

  const startEdit = (storeName: string, key: string, value: unknown) => {
    setEditingKey(`${storeName}.${key}`)
    setEditValue(JSON.stringify(value))
  }

  const commitEdit = (storeName: string, key: string) => {
    try {
      const parsed = JSON.parse(editValue())
      safeInvokeVoid('store_set', { name: storeName, key, value: parsed })
      setEditingKey(null)
    } catch {
      // Invalid JSON — keep editing
    }
  }

  const cancelEdit = () => setEditingKey(null)

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '12px', height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
        <span style={{ color: '#888', 'font-size': '11px' }}>{Object.keys(stores()).length} store(s)</span>
        <button
          onClick={refresh}
          style={{ background: '#2a2a4a', border: 'none', color: '#e0e0e0', padding: '2px 8px', 'border-radius': '4px', cursor: 'pointer', 'font-size': '11px' }}
        >
          Refresh
        </button>
      </div>

      <For each={Object.entries(stores())}>
        {([storeName, storeData]) => (
          <div style={{ border: '1px solid #2a2a4a', 'border-radius': '4px', overflow: 'hidden' }}>
            <div style={{ background: '#1e1e3a', padding: '6px 10px', 'font-weight': 'bold', color: '#6c63ff', 'font-size': '12px' }}>
              {storeName}
            </div>
            <div style={{ padding: '4px' }}>
              <For each={Object.entries(storeData as Record<string, unknown>)}>
                {([key, value]) => {
                  const fullKey = `${storeName}.${key}`
                  const isEditing = () => editingKey() === fullKey
                  const isFlashing = () => flashKeys().has(fullKey)

                  return (
                    <div
                      style={{
                        display: 'flex',
                        'align-items': 'center',
                        padding: '3px 8px',
                        'border-bottom': '1px solid #1a1a2e',
                        background: isFlashing() ? '#6c63ff22' : 'transparent',
                        transition: 'background 0.3s',
                      }}
                    >
                      <span style={{ color: '#50fa7b', 'min-width': '120px', 'flex-shrink': '0', 'font-size': '11px' }}>{key}</span>
                      {isEditing() ? (
                        <div style={{ display: 'flex', gap: '4px', flex: '1' }}>
                          <input
                            value={editValue()}
                            onInput={(e) => setEditValue(e.currentTarget.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEdit(storeName, key)
                              if (e.key === 'Escape') cancelEdit()
                            }}
                            style={{
                              flex: '1',
                              background: '#2a2a4a',
                              border: '1px solid #6c63ff',
                              color: '#e0e0e0',
                              padding: '2px 6px',
                              'border-radius': '3px',
                              'font-family': 'inherit',
                              'font-size': '11px',
                            }}
                            autofocus
                          />
                        </div>
                      ) : (
                        <span
                          onClick={() => startEdit(storeName, key, value)}
                          style={{
                            color: typeof value === 'boolean' ? (value ? '#50fa7b' : '#ff5555') : typeof value === 'number' ? '#bd93f9' : '#f8f8f2',
                            cursor: 'pointer',
                            'font-size': '11px',
                          }}
                          title="Click to edit"
                        >
                          {JSON.stringify(value)}
                        </span>
                      )}
                    </div>
                  )
                }}
              </For>
            </div>
          </div>
        )}
      </For>
    </div>
  )
}
```

**Step 2: 커밋**

```bash
git add packages/sdk/src/devtools/StoreInspector.tsx
git commit -m "feat(sdk): add DevTools Store Inspector tab component"
```

---

## Task 11: SDK — Input Monitor 탭 컴포넌트

**Files:**
- Create: `packages/sdk/src/devtools/InputMonitor.tsx`

**Context:** 실시간 키 입력 스트림과 등록된 핫키 목록을 표시하는 패널.

**Step 1: InputMonitor.tsx 작성**

```tsx
// packages/sdk/src/devtools/InputMonitor.tsx
import { createSignal, onMount, onCleanup, For, type Component } from 'solid-js'
import { safeInvoke, safeListen } from '../tauri'

interface KeyEvent {
  id: number
  key: string
  pressed: boolean
  timestamp: number
}

interface HotkeyInfo {
  id: string
  keys: string[]
}

const MAX_EVENTS = 200
let eventId = 0

export const InputMonitor: Component = () => {
  const [keyEvents, setKeyEvents] = createSignal<KeyEvent[]>([])
  const [hotkeys, setHotkeys] = createSignal<HotkeyInfo[]>([])
  const [activeHotkeys, setActiveHotkeys] = createSignal<Set<string>>(new Set())
  let scrollRef: HTMLDivElement | undefined

  const loadHotkeys = async () => {
    const data = await safeInvoke<HotkeyInfo[]>('devtools_list_hotkeys')
    if (data) setHotkeys(data)
  }

  onMount(async () => {
    await loadHotkeys()

    const unlistenKey = await safeListen<{ key: string; pressed: boolean }>(
      'input:key-event',
      (event) => {
        const entry: KeyEvent = {
          id: ++eventId,
          key: event.payload.key,
          pressed: event.payload.pressed,
          timestamp: Date.now(),
        }
        setKeyEvents((prev) => {
          const next = [...prev, entry]
          return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next
        })
        if (scrollRef) {
          requestAnimationFrame(() => {
            scrollRef!.scrollTop = scrollRef!.scrollHeight
          })
        }
      },
    )

    const unlistenHotkey = await safeListen<{ id: string; phase: string }>(
      'input:hotkey-triggered',
      (event) => {
        const { id, phase } = event.payload
        setActiveHotkeys((prev) => {
          const next = new Set(prev)
          if (phase === 'press') next.add(id)
          else next.delete(id)
          return next
        })
      },
    )

    onCleanup(() => {
      unlistenKey()
      unlistenHotkey()
    })
  })

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`
  }

  return (
    <div style={{ display: 'flex', gap: '12px', height: '100%' }}>
      {/* Key event stream */}
      <div style={{ flex: '1', display: 'flex', 'flex-direction': 'column', 'min-width': '0' }}>
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'padding-bottom': '4px', 'border-bottom': '1px solid #2a2a4a' }}>
          <span style={{ color: '#888', 'font-size': '11px' }}>Key Events</span>
          <button
            onClick={() => setKeyEvents([])}
            style={{ background: '#2a2a4a', border: 'none', color: '#e0e0e0', padding: '2px 8px', 'border-radius': '4px', cursor: 'pointer', 'font-size': '11px' }}
          >
            Clear
          </button>
        </div>
        <div ref={scrollRef} style={{ flex: '1', overflow: 'auto', 'font-size': '11px', 'line-height': '1.6', 'margin-top': '4px' }}>
          <For each={keyEvents()}>
            {(entry) => (
              <div style={{ display: 'flex', gap: '8px', padding: '1px 4px' }}>
                <span style={{ color: '#555', 'min-width': '85px' }}>{formatTime(entry.timestamp)}</span>
                <span style={{
                  color: entry.pressed ? '#50fa7b' : '#ff5555',
                  'min-width': '16px',
                }}>
                  {entry.pressed ? '\u25BC' : '\u25B2'}
                </span>
                <span style={{ color: '#f8f8f2', 'font-weight': entry.pressed ? 'bold' : 'normal' }}>
                  {entry.key}
                </span>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* Hotkey list */}
      <div style={{ width: '240px', 'flex-shrink': '0', 'border-left': '1px solid #2a2a4a', 'padding-left': '12px' }}>
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'padding-bottom': '4px', 'border-bottom': '1px solid #2a2a4a' }}>
          <span style={{ color: '#888', 'font-size': '11px' }}>Registered Hotkeys</span>
          <button
            onClick={loadHotkeys}
            style={{ background: '#2a2a4a', border: 'none', color: '#e0e0e0', padding: '2px 8px', 'border-radius': '4px', cursor: 'pointer', 'font-size': '11px' }}
          >
            Refresh
          </button>
        </div>
        <div style={{ 'margin-top': '4px' }}>
          <For each={hotkeys()}>
            {(hk) => (
              <div style={{
                display: 'flex',
                'justify-content': 'space-between',
                'align-items': 'center',
                padding: '4px 8px',
                'border-radius': '4px',
                'margin-bottom': '2px',
                background: activeHotkeys().has(hk.id) ? '#6c63ff33' : '#1e1e3a',
                transition: 'background 0.2s',
              }}>
                <span style={{ color: '#f8f8f2', 'font-size': '11px' }}>{hk.id}</span>
                <span style={{ color: '#bd93f9', 'font-size': '10px' }}>
                  {hk.keys.join(' + ')}
                </span>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: 커밋**

```bash
git add packages/sdk/src/devtools/InputMonitor.tsx
git commit -m "feat(sdk): add DevTools Input Monitor tab component"
```

---

## Task 12: SDK — Events 탭 컴포넌트

**Files:**
- Create: `packages/sdk/src/devtools/EventsPanel.tsx`

**Context:** Tauri 이벤트 버스의 주요 이벤트를 실시간으로 로깅하는 패널.

**Step 1: EventsPanel.tsx 작성**

```tsx
// packages/sdk/src/devtools/EventsPanel.tsx
import { createSignal, onMount, onCleanup, For, type Component } from 'solid-js'
import { safeListen } from '../tauri'

interface EventEntry {
  id: number
  event: string
  payload: unknown
  timestamp: number
  expanded: boolean
}

const MAX_EVENTS = 500
let eventId = 0

const WATCHED_EVENTS = [
  'store:changed',
  'window:visibility-changed',
  'input:hotkey-triggered',
  'devtools:log',
  'devtools:event',
  'input:key-event',
]

const eventColors: Record<string, string> = {
  'store:changed': '#50fa7b',
  'window:visibility-changed': '#f1fa8c',
  'input:hotkey-triggered': '#ff79c6',
  'devtools:log': '#8be9fd',
  'devtools:event': '#bd93f9',
  'input:key-event': '#ffb86c',
}

export const EventsPanel: Component = () => {
  const [events, setEvents] = createSignal<EventEntry[]>([])
  const [filter, setFilter] = createSignal('')
  let scrollRef: HTMLDivElement | undefined
  const unlisteners: (() => void)[] = []

  const addEvent = (eventName: string, payload: unknown) => {
    const entry: EventEntry = {
      id: ++eventId,
      event: eventName,
      payload,
      timestamp: Date.now(),
      expanded: false,
    }
    setEvents((prev) => {
      const next = [...prev, entry]
      return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next
    })
    if (scrollRef) {
      requestAnimationFrame(() => {
        scrollRef!.scrollTop = scrollRef!.scrollHeight
      })
    }
  }

  const toggleExpand = (id: number) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, expanded: !e.expanded } : e)),
    )
  }

  onMount(async () => {
    for (const eventName of WATCHED_EVENTS) {
      const unlisten = await safeListen<unknown>(eventName, (event) => {
        addEvent(eventName, event.payload)
      })
      unlisteners.push(unlisten)
    }

    onCleanup(() => {
      unlisteners.forEach((fn) => fn())
    })
  })

  const filteredEvents = () => {
    const f = filter().toLowerCase()
    if (!f) return events()
    return events().filter((e) => e.event.toLowerCase().includes(f))
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`
  }

  const formatPayload = (payload: unknown): string => {
    try {
      return JSON.stringify(payload, null, 2)
    } catch {
      return String(payload)
    }
  }

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '8px', padding: '4px 0', 'border-bottom': '1px solid #2a2a4a', 'align-items': 'center' }}>
        <button
          onClick={() => setEvents([])}
          style={{ background: '#2a2a4a', border: 'none', color: '#e0e0e0', padding: '2px 8px', 'border-radius': '4px', cursor: 'pointer', 'font-size': '11px' }}
        >
          Clear
        </button>
        <input
          placeholder="Filter events..."
          value={filter()}
          onInput={(e) => setFilter(e.currentTarget.value)}
          style={{
            flex: '1',
            background: '#2a2a4a',
            border: '1px solid #333',
            color: '#e0e0e0',
            padding: '3px 8px',
            'border-radius': '4px',
            'font-family': 'inherit',
            'font-size': '11px',
          }}
        />
        <span style={{ color: '#555', 'font-size': '10px' }}>{filteredEvents().length} events</span>
      </div>

      {/* Event list */}
      <div ref={scrollRef} style={{ flex: '1', overflow: 'auto', 'font-size': '11px', 'line-height': '1.6', 'margin-top': '4px' }}>
        <For each={filteredEvents()}>
          {(entry) => (
            <div style={{ 'border-bottom': '1px solid #1a1a2e' }}>
              <div
                onClick={() => toggleExpand(entry.id)}
                style={{ display: 'flex', gap: '8px', padding: '2px 4px', cursor: 'pointer' }}
              >
                <span style={{ color: '#555', 'min-width': '85px', 'flex-shrink': '0' }}>
                  {formatTime(entry.timestamp)}
                </span>
                <span style={{ color: '#666', 'min-width': '14px' }}>
                  {entry.expanded ? '\u25BC' : '\u25B6'}
                </span>
                <span style={{ color: eventColors[entry.event] || '#888', 'font-weight': 'bold' }}>
                  {entry.event}
                </span>
              </div>
              {entry.expanded && (
                <pre style={{
                  margin: '0',
                  padding: '4px 8px 4px 110px',
                  color: '#8be9fd',
                  'font-size': '10px',
                  'white-space': 'pre-wrap',
                  'word-break': 'break-all',
                  background: '#16162a',
                }}>
                  {formatPayload(entry.payload)}
                </pre>
              )}
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
```

**Step 2: 커밋**

```bash
git add packages/sdk/src/devtools/EventsPanel.tsx
git commit -m "feat(sdk): add DevTools Events tab component"
```

---

## Task 13: 통합 빌드 확인 및 src-tauri 동기화

**Files:**
- Sync: `packages/tauri-runtime/` → `apps/example/src-tauri/`

**Context:** 모든 변경사항을 통합적으로 빌드하고, template(packages/tauri-runtime)의 변경을 example의 src-tauri에도 동기화한다.

**Step 1: TypeScript 빌드 확인**

Run: `cd /Users/sunwoo/work/WhaLe && npx turbo build --filter=@whale/sdk --filter=@whale/cli`
Expected: no errors

**Step 2: src-tauri 동기화**

```bash
# Rust 소스 동기화 (src-tauri는 gitignore이므로 로컬에서만)
cp packages/tauri-runtime/src/state/store_state.rs apps/example/src-tauri/src/state/store_state.rs
cp packages/tauri-runtime/src/state/input_state.rs apps/example/src-tauri/src/state/input_state.rs
cp packages/tauri-runtime/src/commands/devtools_cmd.rs apps/example/src-tauri/src/commands/devtools_cmd.rs
cp packages/tauri-runtime/src/bridge.rs apps/example/src-tauri/src/bridge.rs
cp packages/tauri-runtime/src/main.rs apps/example/src-tauri/src/main.rs
cp packages/tauri-runtime/src/state/frida_state.rs apps/example/src-tauri/src/state/frida_state.rs
```

commands/mod.rs도 동기화:
```bash
cp packages/tauri-runtime/src/commands/mod.rs apps/example/src-tauri/src/commands/mod.rs
```

**Step 3: Rust 빌드 확인**

Run: `cd apps/example/src-tauri && cargo check`
Expected: no errors

**Step 4: Rust 테스트 통과 확인**

Run: `cd apps/example/src-tauri && cargo test`
Expected: ALL PASS

**Step 5: 최종 커밋**

```bash
git add -A -- ':!apps/example/src-tauri'
git commit -m "feat(devtools): complete Whale Dev Tools integration"
```
