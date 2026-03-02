import { invoke } from '@tauri-apps/api/core'
import { listen, type Event, type EventName, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

let runtimeCache: boolean | undefined

export function isTauriRuntime(): boolean {
  if (typeof runtimeCache === 'boolean') return runtimeCache
  if (typeof window === 'undefined') {
    // Keep tests and non-browser runtimes working with mocked Tauri APIs.
    runtimeCache = true
    return runtimeCache
  }
  runtimeCache = typeof (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== 'undefined'
  return runtimeCache
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
  if (!isTauriRuntime()) return undefined
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
  if (!isTauriRuntime()) return
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
  if (!isTauriRuntime()) return () => {}
  try {
    return await listen<T>(event, handler)
  } catch {
    return () => {}
  }
}
