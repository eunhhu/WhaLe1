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

### `useSession(session)` — Session 핸들

```ts
function useSession(session: Session): SessionHandle

interface SessionHandle {
  status: Accessor<'attached' | 'detached'>
  loadScript(code: string, storeName?: string): Promise<Script>
  loadScriptFile(path: string, storeName?: string): Promise<Script>
  unloadScript(scriptId: string): Promise<void>
  detach(): void
}
```

- `frida:session-detached` 이벤트 수신 시 `status='detached'`
- `storeName` 전달 시 runtime에서 `__<name>__` preamble이 함께 주입됨
- `storeName`에 식별자 불가 문자가 있으면 `_`로 정규화한 전역명 사용 (예: `my-store.v1` → `__my_store_v1__`)

### `useSession(device, options?)` — 통합 세션 관리

`DeviceHandle`을 받아 기기 연결 → 프로세스 목록 → attach → 스크립트 로드 전체 흐름을 단일 훅으로 관리합니다.

```ts
function useSession(
  device: DeviceHandle,
  options?: { scripts?: ScriptConfig[] }
): IntegratedSessionHandle

interface ScriptConfig {
  entry: string
  store?: string
}

type SessionPhase = 'idle' | 'searching' | 'connected' | 'attached' | 'scripted'

interface IntegratedSessionHandle {
  phase: Accessor<SessionPhase>
  processes: Accessor<Process[]>
  session: Accessor<Session | null>
  error: Accessor<string | null>
  fetchProcesses(): Promise<void>
  attachToProcess(pid: number): Promise<void>
  spawnAndAttach(bundleId: string): Promise<void>
  detach(): void
}
```

**기본 사용 패턴:**

```ts
import { useDevice, useSession } from '@whale1/sdk'
import whaleConfig from '../whale.config'

const device = useDevice({ type: 'usb' })
const session = useSession(device, {
  scripts: whaleConfig.frida?.scripts,
})

// phase: 'idle' → 'searching' → 'connected' → 'attached' → 'scripted'
// scripts는 attach 후 자동 로드됨
```

**동작 요약:**

- `phase`는 device 상태 + attach/script 로드 상태를 반영
- `scripts` 옵션에 파일을 전달하면 `attachToProcess`/`spawnAndAttach` 후 자동 로드 → `phase='scripted'`
- `frida:session-detached` 이벤트 발생 시 session 초기화 후 `phase='connected'`(기기 있음) 또는 `'idle'`으로 복귀
- `detach()` 호출 시 session 해제 후 `phase='connected'`(기기 있음) 또는 `'idle'`으로 복귀

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

---

## Frida 스크립트에서 Store 사용

### store별 전역 변수

`whale.config.ts`의 `frida.scripts[].store` 필드에 store 이름을 지정하면 런타임이 `__<name>__` 전역 변수를 스크립트에 자동 주입합니다.

```ts
// whale.config.ts
frida: {
  scripts: [{ entry: './src/script/main.ts', store: 'trainer' }]
}
// → Frida 스크립트 안에서 __trainer__ 사용 가능
```

### 타입 선언 (globals.d.ts)

`src/script/globals.d.ts`에서 store 파일의 `typeof`를 `import type`으로 참조합니다.
store 필드를 추가하면 타입이 자동 반영됩니다. 별도 `.d.ts` 이중 유지 불필요.

```ts
// src/script/globals.d.ts
import type { trainer } from '../../store/trainer'
import type { esp } from '../../store/esp'        // store 추가 시 한 줄 추가

type StoreGlobal<T> = {
  readonly [K in keyof T]: T[K]
} & {
  set<K extends keyof T>(key: K, value: T[K]): void
}

declare global {
  const __trainer__: StoreGlobal<typeof trainer>
  const __esp__: StoreGlobal<typeof esp>          // store 추가 시 한 줄 추가
}

export {}
```

### 스크립트에서 사용

```ts
// src/script/main.ts
if (__trainer__.godMode) {
  // god mode 로직
}

// 값 변경 — UI에 자동 동기화
__trainer__.set('speedHack', 2.0)
```

### store 추가 체크리스트

새 store를 추가할 때 필요한 작업:

1. `store/mystore.ts` — `createSyncStore('mystore', { ... })` 생성
2. `src/script/globals.d.ts` — `import type` + `declare global` 한 줄씩 추가
3. `whale.config.ts` — `frida.scripts`에 `{ entry, store: 'mystore' }` 추가
