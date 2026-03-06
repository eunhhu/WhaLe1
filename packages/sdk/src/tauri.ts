import { invoke } from '@tauri-apps/api/core'
import { listen, type Event, type EventName, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

let runtimeCache: boolean | undefined

export function isTauriRuntime(): boolean {
  // Cache only positive detection. Negative detection can be transient during
  // early bootstrap before Tauri globals are injected.
  if (runtimeCache === true) return true
  if (typeof window === 'undefined') {
    return false
  }

  const w = window as {
    __TAURI_INTERNALS__?: unknown
    __TAURI__?: unknown
    __TAURI_IPC__?: unknown
    __TAURI_INVOKE__?: unknown
  }

  const hasRuntimeGlobal =
    typeof w.__TAURI_INTERNALS__ !== 'undefined' ||
    typeof w.__TAURI__ !== 'undefined' ||
    typeof w.__TAURI_IPC__ !== 'undefined' ||
    typeof w.__TAURI_INVOKE__ !== 'undefined'

  if (hasRuntimeGlobal) {
    runtimeCache = true
    return true
  }

  try {
    const current = getCurrentWebviewWindow()
    const detected = typeof current.label === 'string' && current.label.length > 0
    if (detected) runtimeCache = true
    return detected
  } catch {
    return false
  }
}

export function getCurrentWindowLabel(): string | undefined {
  if (!isTauriRuntime()) return undefined
  try {
    return getCurrentWebviewWindow().label
  } catch {
    return undefined
  }
}

export async function safeInvoke<T>(
  command: string,
  payload?: Record<string, unknown>,
): Promise<T | undefined> {
  try {
    if (typeof payload === 'undefined') {
      return await invoke<T>(command)
    }
    return await invoke<T>(command, payload)
  } catch {
    return undefined
  }
}

export function safeInvokeVoid(command: string, payload?: Record<string, unknown>): void {
  try {
    const result = typeof payload === 'undefined'
      ? invoke(command)
      : invoke(command, payload)
    if (result && typeof (result as { catch?: unknown }).catch === 'function') {
      void (result as Promise<unknown>).catch(() => {})
    }
  } catch {
    // swallow errors for fire-and-forget calls
  }
}

export async function safeListen<T>(
  event: EventName,
  handler: (event: Event<T>) => void,
): Promise<UnlistenFn> {
  try {
    return await listen<T>(event, handler)
  } catch {
    return () => {}
  }
}
