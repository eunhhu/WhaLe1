# Whale Dev Tools Design

## Goal

Chrome DevTools처럼 모든 Whale 앱에 내장되는 디버깅 도구 윈도우. dev 모드에서 F12로 토글하며, Console/Store Inspector/Input Monitor/Events 4개 탭을 제공한다.

## Architecture

```
┌─────────────────┐    devtools:log      ┌────────────────────────┐
│   Rust Core      │ ──────────────────→  │  __devtools__ window   │
│                  │    store:changed     │  (F12 toggle)          │
│  FridaManager    │ ──────────────────→  │                        │
│  StoreManager    │    devtools:event    │  ┌─ Console ─────────┐ │
│  InputManager    │ ──────────────────→  │  ├─ Store Inspector ─┤ │
│                  │    input:key-event   │  ├─ Input Monitor ───┤ │
│                  │ ──────────────────→  │  └─ Events ──────────┘ │
└─────────────────┘                      └────────────────────────┘
```

- **Rust**: 기존 매니저에 `devtools:log` / `devtools:event` / `input:key-event` 이벤트 emit 추가
- **CLI**: `whale dev` 실행 시 `__devtools__` 윈도우를 tauri.conf.json에 자동 주입 + HTML 엔트리 자동 생성. `whale build`에서는 제외
- **SDK**: `@whale/sdk`에 DevTools SolidJS UI 컴포넌트 내장. `packages/sdk/src/devtools/` 디렉토리
- **핫키**: CLI가 dev 모드에서 F12를 `__devtools__` toggle로 자동 등록 (Rust InputManager)

## Tab Design

### Console Tab
- **소스 구분 태그**: `[frida]` `[rust]` `[store]` `[event]`
- **레벨**: `info` / `warn` / `error` / `debug` — 필터 토글
- **소스별 필터** 토글 버튼
- **타임스탬프** 표시 (HH:mm:ss.SSS)
- **자동 스크롤** + 하단 고정 토글
- **Clear** 버튼
- **데이터 흐름**: Rust에서 `devtools:log` 이벤트를 emit → SDK가 listen하여 로그 배열에 push → 렌더링

### Store Inspector Tab
- 등록된 **모든 SyncStore 목록** 표시 (새 Tauri 커맨드 `devtools_list_stores` 필요)
- 각 store의 **key-value 실시간 표시** (`store:changed` 이벤트 listen)
- 값 **클릭하여 인라인 편집** → `store_set` 호출로 실시간 반영
- 값 변경 시 **하이라이트 애니메이션** (flash)

### Input Monitor Tab
- **실시간 키 입력 스트림**: 새 이벤트 `input:key-event` (모든 키 press/release)
- **등록된 핫키 목록** + 현재 활성화 상태
- 핫키 **트리거 시 하이라이트**
- 새 Tauri 커맨드 `devtools_list_hotkeys` 필요

### Events Tab
- **Tauri 이벤트 버스** 실시간 모니터링
- 이벤트 이름 **필터** 입력
- payload **JSON 펼치기/접기**
- 이벤트 목록: `store:changed`, `window:visibility-changed`, `input:hotkey-triggered`, `devtools:log`, `devtools:event`, `input:key-event`

## Rust Changes

### New Events (기존 코드에 emit 추가)

1. **bridge.rs** `handle_frida_message()`: Frida 메시지 도착 시 `devtools:log` emit
   ```rust
   app.emit("devtools:log", json!({
     "source": "frida", "level": "info",
     "message": payload.to_string(),
     "timestamp": now_ms()
   }));
   ```

2. **frida_state.rs** `WhaleScriptHandler::on_message()`: Log/Error 메시지도 `devtools:log` emit
   ```rust
   // Message::Log → devtools:log (source: "frida", level from log_msg.level)
   // Message::Error → devtools:log (source: "frida", level: "error")
   ```

3. **input_state.rs** `start_listener()`: 모든 키 press/release에 `input:key-event` emit
   ```rust
   app.emit("input:key-event", json!({
     "key": key_name, "pressed": is_press,
     "timestamp": now_ms()
   }));
   ```

4. **store_cmd.rs** `store_set`: 값 변경 시 `devtools:event` emit (기존 `store:changed`에 추가)

### New Tauri Commands

1. **`devtools_list_stores`**: StoreManager의 모든 store 이름과 값 반환
   ```rust
   #[tauri::command]
   pub fn devtools_list_stores(store: State<StoreManager>) -> HashMap<String, HashMap<String, Value>>
   ```

2. **`devtools_list_hotkeys`**: InputManager의 등록된 핫키 목록 반환
   ```rust
   #[tauri::command]
   pub fn devtools_list_hotkeys(input: State<InputManager>) -> Vec<HotkeyEntry>
   ```

### StoreManager 변경

- `list_all()` 메서드 추가: 모든 store의 현재 상태를 `HashMap<String, HashMap<String, Value>>`로 반환

### InputManager 변경

- `list_hotkeys()` 메서드 추가: 등록된 핫키 목록 반환
- `start_listener()`: 모든 키 이벤트에 `input:key-event` emit 추가

## CLI Changes

### generateTauriConf() (tauri-conf.ts)

dev 모드일 때 `__devtools__` 윈도우 자동 주입:
```typescript
if (mode === 'development') {
  windows.push({
    label: '__devtools__',
    url: '__devtools__.html',
    width: 900,
    height: 600,
    resizable: true,
    decorations: true,
    visible: false,  // F12로 토글
  })
}
```

### generateHtmlEntries() (html-entry.ts)

dev 모드일 때 `__devtools__` HTML 엔트리 자동 생성:
- `@whale/sdk/devtools` 엔트리를 import하여 렌더
- whale.config.ts의 windows에 정의하지 않아도 자동 생성

### main.rs (tauri-runtime)

dev 모드일 때 F12 핫키 자동 등록:
```rust
if cfg!(debug_assertions) {
  input_manager.register_hotkey("__devtools_toggle__", vec!["f12".to_string()]);
  // input:hotkey-triggered 이벤트에서 __devtools_toggle__ 감지 시
  // window_toggle("__devtools__") 호출
}
```

## SDK Changes

### New: packages/sdk/src/devtools/

```
devtools/
├── DevTools.tsx         # 메인 컨테이너 (탭 전환)
├── Console.tsx          # 로그 뷰어
├── StoreInspector.tsx   # Store 실시간 뷰어/에디터
├── InputMonitor.tsx     # 키 입력 모니터
├── EventsPanel.tsx      # 이벤트 로그
├── entry.tsx            # __devtools__ 윈도우 엔트리포인트
└── styles.ts            # devtools 전용 스타일
```

### DevTools.tsx
- 4개 탭 (Console / Store / Input / Events)
- 탭 전환 UI (상단 탭 바)
- `@whale/ui`의 Flex, Text, Badge, Button 활용

### Console.tsx
- `listen('devtools:log', ...)` 로 로그 수신
- 소스/레벨 필터링
- 가상 스크롤 (성능 — 로그가 많아질 수 있음)
- 최대 1000개 로그 유지 (FIFO)

### StoreInspector.tsx
- 초기 로드: `invoke('devtools_list_stores')` 호출
- 실시간 업데이트: `listen('store:changed', ...)` 로 패치 수신
- 값 편집: `invoke('store_set', { name, key, value })` 호출

### InputMonitor.tsx
- `listen('input:key-event', ...)` 로 키 이벤트 수신
- `invoke('devtools_list_hotkeys')` 로 핫키 목록 로드
- `listen('input:hotkey-triggered', ...)` 로 핫키 활성화 감지

### EventsPanel.tsx
- 모든 주요 이벤트를 listen:
  - `store:changed`, `window:visibility-changed`, `input:hotkey-triggered`
  - `devtools:log`, `devtools:event`, `input:key-event`
- 이벤트명 필터 입력
- JSON payload 접기/펼치기

### exports

```typescript
// packages/sdk/src/index.ts — devtools는 별도 엔트리로만 노출
// packages/sdk/src/devtools/entry.tsx — __devtools__ 윈도우의 엔트리포인트
```

## Production 분리

- CLI `whale build`에서는 `__devtools__` 윈도우를 tauri.conf.json에 추가하지 않음
- Rust `cfg!(debug_assertions)`로 F12 핫키, devtools 이벤트 emit을 dev 빌드에서만 활성화
- SDK의 devtools 컴포넌트는 tree-shake 가능하나, 윈도우 자체가 없으므로 로드되지 않음

## Success Criteria

1. `whale dev`로 앱 실행 후 F12를 누르면 DevTools 윈도우가 토글됨
2. Console 탭에서 Frida script 로그, Rust 로그가 실시간으로 보임
3. Store Inspector에서 모든 store 값이 실시간으로 보이고, 값을 편집하면 즉시 반영됨
4. Input Monitor에서 키 입력이 실시간으로 표시되고, 핫키 트리거가 하이라이트됨
5. Events 탭에서 Tauri 이벤트가 실시간으로 로깅됨
6. `whale build`에서는 DevTools 관련 코드가 완전히 제거됨
