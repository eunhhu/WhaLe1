# WhaLe SDK API Reference

The WhaLe SDK (`@whale/sdk`) provides SolidJS primitives for building overlay windows, managing Frida sessions, and controlling input simulation within the WhaLe framework.

---

## Installation

```ts
import { createSyncStore, useWindow, useHotkey } from '@whale/sdk'
```

---

## Store

### `createSyncStore`

Creates a reactive store that is synchronized across all windows via the Rust backend.

```ts
function createSyncStore<T extends Record<string, any>>(
  name: string,
  defaults: T,
): SyncStore<T>
```

**Parameters**

| Parameter  | Type     | Description                                      |
|------------|----------|--------------------------------------------------|
| `name`     | `string` | Unique store identifier shared across windows.   |
| `defaults` | `T`      | Initial values. All keys are subscribed automatically. |

**Returns** `SyncStore<T>` — a reactive proxy with getter properties and `setXxx` setter methods for each key.

**Notes**

- Mutations from any window or from Frida scripts are reflected reactively via the `store:changed` Tauri event.
- Setters call `invoke('store_set', ...)` to propagate changes to the backend and all subscribers.
- Cleanup (unsubscribe + event unlisten) is registered automatically when called inside a SolidJS component.

**Example**

```ts
const store = createSyncStore('ui', { visible: true, opacity: 1.0 })

// Read
console.log(store.visible)   // true

// Write (propagates to all windows)
store.setVisible(false)
store.setOpacity(0.5)
```

---

## Window Hooks

### `useWindow`

Returns a handle for controlling any named window managed by WhaLe.

```ts
function useWindow(id: string): WindowHandle
```

**Parameters**

| Parameter | Type     | Description              |
|-----------|----------|--------------------------|
| `id`      | `string` | The target window label. |

**Returns** `WindowHandle`

```ts
interface WindowHandle {
  visible: Accessor<boolean>
  show(): void
  hide(): void
  toggle(): void
  close(): void
  setPosition(x: number, y: number): void
  setSize(w: number, h: number): void
  setAlwaysOnTop(value: boolean): void
  center(): void
}
```

| Member            | Description                                              |
|-------------------|----------------------------------------------------------|
| `visible`         | Reactive signal tracking current visibility state.       |
| `show()`          | Makes the window visible.                                |
| `hide()`          | Hides the window.                                        |
| `toggle()`        | Toggles visibility.                                      |
| `close()`         | Closes and destroys the window.                          |
| `setPosition(x, y)` | Moves the window to screen coordinates `(x, y)`.     |
| `setSize(w, h)`   | Resizes the window to `(w, h)` pixels.                   |
| `setAlwaysOnTop(value)` | Sets or clears always-on-top behavior.            |
| `center()`        | Centers the window on screen.                            |

**Notes**

- Listens to the `window:visibility-changed` Tauri event to keep `visible` in sync.
- The event listener is cleaned up automatically inside a SolidJS component.

**Example**

```ts
const win = useWindow('overlay')

win.show()
win.setPosition(100, 200)
win.setSize(800, 600)
win.setAlwaysOnTop(true)

createEffect(() => {
  console.log('visible:', win.visible())
})
```

---

### `useCurrentWindow`

Returns a handle for the window in which the current script is running.

```ts
function useCurrentWindow(): CurrentWindowHandle
```

**Returns** `CurrentWindowHandle`

```ts
interface CurrentWindowHandle extends WindowHandle {
  id: string
}
```

`id` is the label of the current webview window as reported by Tauri. All other members are identical to `WindowHandle`.

**Example**

```ts
const win = useCurrentWindow()

console.log(win.id)  // e.g. "main"
win.hide()
```

---

## Input Hooks

### `useHotkey`

Registers a global hotkey and returns a handle for managing it.

```ts
function useHotkey(keys: string[], callback: () => void): HotkeyHandle
```

**Parameters**

| Parameter  | Type         | Description                                            |
|------------|--------------|--------------------------------------------------------|
| `keys`     | `string[]`   | Key combination to register, e.g. `['CmdOrCtrl', 'Shift', 'H']`. |
| `callback` | `() => void` | Function called when the hotkey fires while enabled.   |

**Returns** `HotkeyHandle`

```ts
interface HotkeyHandle {
  enabled: Accessor<boolean>
  setEnabled(value: boolean): void
  unregister(): void
}
```

| Member         | Description                                                   |
|----------------|---------------------------------------------------------------|
| `enabled`      | Reactive signal. When `false`, `callback` is suppressed.      |
| `setEnabled(value)` | Enables or disables the callback without unregistering.  |
| `unregister()` | Removes the hotkey from the global registry.                  |

**Notes**

- Each `useHotkey` call registers an independent hotkey with a unique internal ID.
- Inside a SolidJS component, `unregister` is called automatically on cleanup.
- Throws `HotkeyConflictError` if the key combination is already registered.

**Example**

```ts
const hk = useHotkey(['CmdOrCtrl', 'Shift', 'H'], () => {
  win.toggle()
})

// Temporarily disable
hk.setEnabled(false)

// Manually remove
hk.unregister()
```

---

### `useSimulate`

Returns a handle for simulating keyboard and mouse input at the OS level.

```ts
function useSimulate(): SimulateHandle
```

**Returns** `SimulateHandle`

```ts
interface SimulateHandle {
  keyPress(key: string): void
  keyDown(key: string): void
  keyUp(key: string): void
  mouseClick(x: number, y: number): void
  mouseMove(x: number, y: number): void
}
```

| Member              | Description                                                    |
|---------------------|----------------------------------------------------------------|
| `keyPress(key)`     | Synthesizes a full key press (down + up) for `key`.            |
| `keyDown(key)`      | Sends a key-down event for `key`.                              |
| `keyUp(key)`        | Sends a key-up event for `key`.                                |
| `mouseClick(x, y)`  | Clicks the mouse at screen coordinates `(x, y)`.              |
| `mouseMove(x, y)`   | Moves the mouse cursor to screen coordinates `(x, y)`.        |

**Example**

```ts
const sim = useSimulate()

sim.keyPress('Return')
sim.mouseMove(500, 300)
sim.mouseClick(500, 300)
```

---

## Frida Hooks

### `useDevices`

Lists all Frida-accessible devices, refreshing on mount.

```ts
function useDevices(): DevicesHandle
```

**Returns** `DevicesHandle`

```ts
interface DevicesHandle {
  devices: Accessor<Device[]>
  refresh(): void
}
```

| Member      | Description                                          |
|-------------|------------------------------------------------------|
| `devices`   | Reactive signal containing the current device list.  |
| `refresh()` | Re-queries the backend and updates `devices`.        |

**Example**

```ts
const { devices, refresh } = useDevices()

createEffect(() => {
  console.log(devices().map(d => d.name))
})

// Manually refresh
refresh()
```

---

### `useDevice`

Finds a single Frida device matching an optional filter, and provides spawn/attach helpers.

```ts
function useDevice(filter?: {
  type?: 'usb' | 'local' | 'remote'
  id?: string
}): DeviceHandle
```

**Parameters**

| Parameter       | Type                              | Description                          |
|-----------------|-----------------------------------|--------------------------------------|
| `filter`        | `object` (optional)               | Constraints for device selection.    |
| `filter.type`   | `'usb' \| 'local' \| 'remote'`   | Filter by connection type.           |
| `filter.id`     | `string`                          | Filter by exact device ID.           |

If no filter is provided, the first available device is selected.

**Returns** `DeviceHandle`

```ts
interface DeviceHandle {
  device: Accessor<Device | null>
  status: Accessor<'searching' | 'connected' | 'disconnected'>
  spawn(bundleId: string, opts?: SpawnOptions): Promise<Session>
  attach(pid: number): Promise<Session>
}
```

| Member      | Description                                                                        |
|-------------|------------------------------------------------------------------------------------|
| `device`    | Reactive signal with the matched `Device`, or `null` if not found.                 |
| `status`    | Reactive signal: `'searching'` while probing, `'connected'` or `'disconnected'`.   |
| `spawn(bundleId, opts)` | Spawns an app by bundle ID and attaches, returning a `Session`.      |
| `attach(pid)` | Attaches to a running process by PID, returning a `Session`.                     |

**Throws**

- `Error('No device connected')` if `spawn` or `attach` is called while `device()` is `null`.
- `SpawnFailedError` if the backend cannot spawn the target process.

**Example**

```ts
const { device, status, spawn, attach } = useDevice({ type: 'usb' })

createEffect(() => {
  if (status() === 'connected') {
    console.log('Device ready:', device()?.name)
  }
})

// Spawn an app
const session = await spawn('com.example.App')

// Or attach to a running process
const session2 = await attach(1234)
```

---

### `useSession`

Manages a Frida session: loads scripts and tracks detach state.

```ts
function useSession(session: Session): SessionHandle
```

**Parameters**

| Parameter | Type      | Description                              |
|-----------|-----------|------------------------------------------|
| `session` | `Session` | A session object returned by `useDevice`. |

**Returns** `SessionHandle`

```ts
interface SessionHandle {
  status: Accessor<'attached' | 'detached'>
  loadScript(code: string): Promise<Script>
  loadScriptFile(path: string): Promise<Script>
  detach(): void
}
```

| Member               | Description                                                            |
|----------------------|------------------------------------------------------------------------|
| `status`             | Reactive signal: `'attached'` or `'detached'`.                         |
| `loadScript(code)`   | Compiles and injects `code` as a Frida script. Returns a `Script`.     |
| `loadScriptFile(path)` | Loads a Frida script from a file path on the host. Returns a `Script`. |
| `detach()`           | Detaches from the process and sets `status` to `'detached'`.           |

**Notes**

- Listens to the `frida:session-detached` event to update `status` reactively when the target process exits.
- The event listener is cleaned up automatically inside a SolidJS component.

**Example**

```ts
const device = useDevice({ type: 'usb' })
const session = await device.spawn('com.example.App')
const { status, loadScript, detach } = useSession(session)

const script = await loadScript(`
  Interceptor.attach(Module.getExportByName(null, 'open'), {
    onEnter(args) { console.log('open:', args[0].readUtf8String()) }
  })
`)

createEffect(() => {
  if (status() === 'detached') console.log('Session ended')
})

// Detach manually
detach()
```

---

## Types

### `SyncStore<T>`

```ts
type SyncStore<T extends Record<string, any>> =
  { readonly [K in keyof T]: T[K] } &
  { [K in keyof T & string as `set${Capitalize<K>}`]: (value: T[K]) => void }
```

A reactive proxy that exposes each key of `T` as a readonly getter and a corresponding `setXxx` setter.

---

### `WindowConfig`

```ts
interface WindowConfig {
  entry: string
  width?: number
  height?: number
  resizable?: boolean
  alwaysOnTop?: boolean
  transparent?: boolean
  decorations?: boolean
  skipTaskbar?: boolean
  visible?: boolean
  position?: { x: number; y: number } | string
  clickThrough?: boolean
}
```

Configuration passed when creating a new WhaLe window.

---

### `Device`

```ts
interface Device {
  id: string
  name: string
  type: 'local' | 'usb' | 'remote'
}
```

Represents a Frida-accessible device.

---

### `Session`

```ts
interface Session {
  id: string
  pid: number
}
```

Represents an active Frida session attached to a process.

---

### `SpawnOptions`

```ts
interface SpawnOptions {
  realm?: 'native' | 'emulated'
}
```

Options passed to `useDevice().spawn()`.

---

### `Script`

```ts
interface Script {
  id: string
}
```

Represents a loaded Frida script.

---

## Errors

All errors extend `WhaleError`, which extends `Error` with an additional `code` property.

### `WhaleError`

```ts
class WhaleError extends Error {
  code: string
}
```

Base class for all WhaLe SDK errors.

---

### `DeviceNotFoundError`

```ts
new DeviceNotFoundError(filter?: string)
// code: 'DEVICE_NOT_FOUND'
```

Thrown when no Frida device matches the requested filter.

---

### `SpawnFailedError`

```ts
new SpawnFailedError(bundleId: string, reason?: string)
// code: 'SPAWN_FAILED'
```

Thrown when the backend fails to spawn a process.

---

### `ScriptError`

```ts
new ScriptError(message: string)
// code: 'SCRIPT_ERROR'
```

Thrown when a Frida script fails to load or execute.

---

### `HotkeyConflictError`

```ts
new HotkeyConflictError(keys: string[])
// code: 'HOTKEY_CONFLICT'
```

Thrown when a hotkey combination is already registered.
