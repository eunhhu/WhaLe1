# @whale1/sdk API

이 문서는 현재 코드베이스(`packages/sdk/src`) 기준의 실제 공개 API를 정리합니다.

## 설치/사용

```ts
import {
  createSyncStore,
  useHotkey,
  useWindow,
  useCurrentWindow,
  useSimulate,
  useDevices,
  useDevice,
  useSession,
  isTauriRuntime,
  safeInvoke,
  safeInvokeVoid,
  safeListen,
} from '@whale1/sdk'
```

## Store

### `createSyncStore<T>(name, defaults)`

```ts
function createSyncStore<T extends Record<string, unknown>>(
  name: string,
  defaults: T,
): SyncStore<T>
```

동작 요약:

- 생성 시 `store_register` 호출
- 현재 window label이 있으면 `store_subscribe` 호출
- 초기 hydrate용 `store_get_all` 호출
- `store:changed` 이벤트 수신 시 로컬 store patch 반영
- `setXxx(value)` 호출 시
  - 로컬 상태 먼저 반영
  - `store_set` IPC 호출

중요:

- `setXxx`는 `defaults`에 정의된 키만 생성됩니다.
- 컴포넌트 컨텍스트에서 생성하면 cleanup 시 unsubscribe/unlisten 수행됩니다.

## Hotkey

### `useHotkey(keys, callback)`

```ts
function useHotkey(keys: string[], callback: () => void): HotkeyHandle
```

- 기존 단일 콜백 모드
- 내부적으로 `onPress`에 매핑되어 **press 시점**에만 호출

### `useHotkey(keys, { onPress, onRelease })`

```ts
function useHotkey(
  keys: string[],
  callbacks: { onPress?: () => void; onRelease?: () => void },
): HotkeyHandle
```

- `input:hotkey-triggered` 이벤트의 `phase`를 분기해서 호출

### `HotkeyHandle`

```ts
interface HotkeyHandle {
  enabled: Accessor<boolean>
  setEnabled(value: boolean): void
  unregister(): void
}
```

- `enabled=false`면 이벤트를 무시하지만 등록은 유지
- `unregister()`는 runtime 등록 해제 + listener cleanup

## Window

### `useWindow(id)`

```ts
function useWindow(id: string): WindowHandle
```

```ts
interface WindowHandle {
  show(): void
  hide(): void
  toggle(): void
  close(): void
  visible: Accessor<boolean>
  setPosition(x: number, y: number): void
  setSize(w: number, h: number): void
  setAlwaysOnTop(value: boolean): void
  center(): void
}
```

- `window:visibility-changed` 이벤트를 구독해 `visible` 반영

### `useCurrentWindow()`

```ts
function useCurrentWindow(): CurrentWindowHandle

interface CurrentWindowHandle extends WindowHandle {
  id: string
}
```

- 현재 webview label을 자동 사용
- label 조회 실패 시 fallback은 `'main'`

## Input Simulation

### `useSimulate()`

```ts
function useSimulate(): {
  keyPress(key: string): void
  keyDown(key: string): void
  keyUp(key: string): void
  mouseClick(x: number, y: number): void
  mouseMove(x: number, y: number): void
}
```

각 메서드는 대응되는 Tauri command를 호출합니다.

- `input_simulate_key_press`
- `input_simulate_key_down`
- `input_simulate_key_up`
- `input_simulate_mouse_click`
- `input_simulate_mouse_move`

## Frida

### `useDevices()`

```ts
function useDevices(): {
  devices: Accessor<Device[]>
  refresh(): void
}
```

- mount 시 `frida_list_devices` 자동 호출

### `useDevice(filter?)`

```ts
function useDevice(filter?: {
  type?: 'usb' | 'local' | 'remote'
  id?: string
}): {
  device: Accessor<Device | null>
  status: Accessor<'searching' | 'connected' | 'disconnected'>
  refresh(): Promise<void>
  spawn(program: string, opts?: SpawnOptions): Promise<Session>
  attach(pid: number): Promise<Session>
  enumerateProcesses(): Promise<Process[]>
  resume(pid: number): Promise<void>
}
```

`spawn` 동작:

1. 우선 `frida_spawn_attach`(1-roundtrip) 시도
2. 미지원/실패 시 `frida_spawn` + `frida_attach` fallback
3. fallback 미지원 상태는 일정 시간 캐시해 반복 시도 비용을 줄임

### `useSession(session)`

```ts
function useSession(session: Session): {
  status: Accessor<'attached' | 'detached'>
  loadScript(code: string, storeName?: string): Promise<Script>
  loadScriptFile(path: string, storeName?: string): Promise<Script>
  unloadScript(scriptId: string): Promise<void>
  detach(): void
}
```

- `frida:session-detached` 이벤트 수신 시 `status='detached'`
- `storeName` 전달 시 runtime에서 `__whale_store__` preamble이 함께 주입됨

## Runtime 유틸

### `isTauriRuntime()`

```ts
function isTauriRuntime(): boolean
```

- 브라우저에서 `window.__TAURI_INTERNALS__` 기반 감지
- 테스트/비브라우저 환경에서는 true로 처리해 mock 환경 호환

### `safeInvoke<T>(command, payload?)`

```ts
function safeInvoke<T>(
  command: string,
  payload?: Record<string, unknown>,
): Promise<T | undefined>
```

- invoke 실패 시 throw하지 않고 `undefined` 반환

### `safeInvokeVoid(command, payload?)`

```ts
function safeInvokeVoid(command: string, payload?: Record<string, unknown>): void
```

- fire-and-forget용
- 내부 오류를 삼키고 앱 흐름을 끊지 않음

### `safeListen<T>(event, handler)`

```ts
function safeListen<T>(
  event: EventName,
  handler: (event: Event<T>) => void,
): Promise<UnlistenFn>
```

- listen 실패 시 noop unlisten 반환

## 주요 타입

```ts
type SyncStore<T extends Record<string, unknown>> = {
  readonly [K in keyof T]: T[K]
} & {
  [K in keyof T & string as `set${Capitalize<K>}`]: (value: T[K]) => void
}
```

```ts
interface Device {
  id: string
  name: string
  type: 'local' | 'usb' | 'remote'
}

interface Session {
  id: string
  pid: number
}

interface SpawnOptions {
  realm?: 'native' | 'emulated'
}

interface Script {
  id: string
}

interface Process {
  pid: number
  name: string
}
```

## 에러 타입

`types.ts`에는 아래 클래스가 정의되어 있습니다.

- `WhaleError`
- `DeviceNotFoundError`
- `SpawnFailedError`
- `ScriptError`
- `HotkeyConflictError`

현재 훅 구현은 대부분 `safeInvoke` 기반으로 실패를 `undefined` 처리하므로, 위 에러 클래스는 앱 레벨에서 커스텀 에러 모델로 활용하는 용도로 보는 것이 안전합니다.
