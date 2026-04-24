# `@whale1/sdk` API

This document describes the actual public surface of the SDK, against the current code in `packages/sdk/src`.

## Install / import

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

What it does:

- Calls `store_register` at creation.
- If a window label exists, calls `store_subscribe`.
- Calls `store_get_all` for the initial hydrate.
- Applies incoming `store:changed` patches to the local store.
- On `setXxx(value)`:
  - Updates the local store first.
  - Invokes `store_set` over IPC.

Notes:

- Only keys present in `defaults` get generated `setXxx` setters.
- When created inside a component, cleanup unsubscribes and removes listeners automatically.

## Hotkey

### `useHotkey(keys, callback)`

```ts
function useHotkey(keys: string[], callback: () => void): HotkeyHandle
```

- Single-callback form.
- Mapped internally to `onPress` — fires only on key-down.

### `useHotkey(keys, { onPress, onRelease })`

```ts
function useHotkey(
  keys: string[],
  callbacks: { onPress?: () => void; onRelease?: () => void },
): HotkeyHandle
```

- Dispatches on `input:hotkey-triggered` using the event's `phase`.

### `HotkeyHandle`

```ts
interface HotkeyHandle {
  enabled: Accessor<boolean>
  setEnabled(value: boolean): void
  unregister(): void
}
```

- When `enabled=false` the events are ignored but the registration is kept.
- `unregister()` tears down both the runtime registration and the listener.

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

- Subscribes to `window:visibility-changed` to keep `visible` in sync.

### `useCurrentWindow()`

```ts
function useCurrentWindow(): CurrentWindowHandle

interface CurrentWindowHandle extends WindowHandle {
  id: string
}
```

- Uses the current webview label automatically.
- Falls back to `'main'` if the label lookup fails.

## Input simulation

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

Each method invokes the corresponding Tauri command:

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

- Calls `frida_list_devices` automatically on mount.

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

`spawn` flow:

1. Tries `frida_spawn_attach` first (1 roundtrip).
2. Falls back to `frida_spawn` + `frida_attach` if unsupported / failed.
3. Unsupported-fallback state is cached for a while to avoid repeated retries.

### `useSession(session)` — raw session handle

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

- Sets `status='detached'` when `frida:session-detached` fires.
- Passing `storeName` makes the runtime inject the `__<name>__` preamble alongside the script.
- Identifiers with non-identifier characters are normalized using `_` (`my-store.v1` → `__my_store_v1__`).

### `useSession(device, options?)` — integrated session

Given a `DeviceHandle`, this hook drives the entire "find device → list processes → attach → load scripts" flow in a single place.

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

**Typical pattern:**

```ts
import { useDevice, useSession } from '@whale1/sdk'
import whaleConfig from '../whale.config'

const device = useDevice({ type: 'usb' })
const session = useSession(device, {
  scripts: whaleConfig.frida?.scripts,
})

// phase: 'idle' → 'searching' → 'connected' → 'attached' → 'scripted'
// scripts auto-load after attach
```

**Behaviour:**

- `phase` reflects the combined device + attach + script-load state.
- If `scripts` is provided, they auto-load after `attachToProcess` / `spawnAndAttach`, bumping `phase` to `'scripted'`.
- `frida:session-detached` clears the session and returns to `'connected'` (device still present) or `'idle'`.
- `detach()` does the same cleanup explicitly.

## Runtime utilities

### `isTauriRuntime()`

```ts
function isTauriRuntime(): boolean
```

- Detects `window.__TAURI_INTERNALS__` in the browser.
- Returns true in non-browser / test environments so mocks still work.

### `safeInvoke<T>(command, payload?)`

```ts
function safeInvoke<T>(
  command: string,
  payload?: Record<string, unknown>,
): Promise<T | undefined>
```

- Never throws; returns `undefined` on failure.

### `safeInvokeVoid(command, payload?)`

```ts
function safeInvokeVoid(command: string, payload?: Record<string, unknown>): void
```

- Fire-and-forget.
- Swallows internal errors so the app flow isn't interrupted.

### `safeListen<T>(event, handler)`

```ts
function safeListen<T>(
  event: EventName,
  handler: (event: Event<T>) => void,
): Promise<UnlistenFn>
```

- Returns a no-op `UnlistenFn` if listening fails.

## Main types

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

## Error classes

`types.ts` exports these:

- `WhaleError`
- `DeviceNotFoundError`
- `SpawnFailedError`
- `ScriptError`
- `HotkeyConflictError`

The hooks currently route failures through `safeInvoke` (returning `undefined`), so treat the error classes primarily as building blocks for an app-level error model.

---

## Using stores inside Frida scripts

### Store globals

Setting `frida.scripts[].store` in `whale.config.ts` makes the runtime inject a `__<name>__` global into that script at load time.

```ts
// whale.config.ts
frida: {
  scripts: [{ entry: './src/script/main.ts', store: 'trainer' }]
}
// → __trainer__ is available inside the script
```

### Type declarations (`globals.d.ts`)

`src/script/globals.d.ts` references the store module with `import type`, so the types track the store file automatically — no hand-maintained `.d.ts`.

```ts
// src/script/globals.d.ts
import type { trainer } from '../../store/trainer'
import type { esp } from '../../store/esp'        // add a new store → one line

type StoreGlobal<T> = {
  readonly [K in keyof T]: T[K]
} & {
  set<K extends keyof T>(key: K, value: T[K]): void
}

declare global {
  const __trainer__: StoreGlobal<typeof trainer>
  const __esp__: StoreGlobal<typeof esp>          // add a new store → one line
}

export {}
```

### Using it in the script

```ts
// src/script/main.ts
if (__trainer__.godMode) {
  // godmode logic
}

// Writes from the script side sync back to the UI
__trainer__.set('speedHack', 2.0)
```

### Adding a new store — checklist

1. `store/mystore.ts` — `createSyncStore('mystore', { ... })`
2. `src/script/globals.d.ts` — add one `import type` + one `declare global` line
3. `whale.config.ts` — add `{ entry, store: 'mystore' }` under `frida.scripts`
