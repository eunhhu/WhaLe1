export { createSyncStore } from './store'
export type {
  SyncStore,
  WindowConfig,
  Device,
  Session,
  SpawnOptions,
  Script,
} from './types'
export {
  WhaleError,
  DeviceNotFoundError,
  SpawnFailedError,
  ScriptError,
  HotkeyConflictError,
} from './types'
export { useHotkey } from './hooks/useHotkey'
export type { HotkeyHandle } from './hooks/useHotkey'
export { useSimulate } from './hooks/useSimulate'
export type { SimulateHandle } from './hooks/useSimulate'
export { useWindow } from './hooks/useWindow'
export { useCurrentWindow } from './hooks/useCurrentWindow'
export type { WindowHandle } from './hooks/useWindow'
export type { CurrentWindowHandle } from './hooks/useCurrentWindow'
