// Store 관련 타입
export type StoreDefaults<T> = {
  [K in keyof T]: T[K]
}

export type SetterName<K extends string> = `set${Capitalize<K>}`

export type SyncStore<T extends Record<string, any>> = {
  readonly [K in keyof T]: T[K]
} & {
  [K in keyof T & string as SetterName<K>]: (value: T[K]) => void
}

// Window 관련 타입
export interface WindowConfig {
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

// Frida 관련 타입
export interface Device {
  id: string
  name: string
  type: 'local' | 'usb' | 'remote'
}

export interface Session {
  id: string
  pid: number
}

export interface SpawnOptions {
  realm?: 'native' | 'emulated'
}

export interface Script {
  id: string
}

// Error 타입
export class WhaleError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message)
    this.name = 'WhaleError'
  }
}

export class DeviceNotFoundError extends WhaleError {
  constructor(filter?: string) {
    super(`Device not found${filter ? `: ${filter}` : ''}`, 'DEVICE_NOT_FOUND')
  }
}

export class SpawnFailedError extends WhaleError {
  constructor(bundleId: string, reason?: string) {
    super(`Failed to spawn ${bundleId}${reason ? `: ${reason}` : ''}`, 'SPAWN_FAILED')
  }
}

export class ScriptError extends WhaleError {
  constructor(message: string) {
    super(message, 'SCRIPT_ERROR')
  }
}

export class HotkeyConflictError extends WhaleError {
  constructor(keys: string[]) {
    super(`Hotkey already registered: ${keys.join('+')}`, 'HOTKEY_CONFLICT')
  }
}
