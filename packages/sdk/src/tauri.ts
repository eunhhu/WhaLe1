import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') {
    // Keep tests and non-browser runtimes working with mocked Tauri APIs.
    return true
  }
  return typeof (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== 'undefined'
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
  void safeInvoke(command, payload)
}

export async function safeListen<T>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => {}
  try {
    return await listen<T>(event, handler as any)
  } catch {
    return () => {}
  }
}
