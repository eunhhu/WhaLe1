import { createSignal, getOwner, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'
import { safeInvokeVoid, safeListen } from '../tauri'

let hotkeyCounter = 0

type HotkeyPhase = 'press' | 'release'

interface HotkeyEventPayload {
  id: string
  phase?: HotkeyPhase
}

export interface HotkeyCallbacks {
  onPress?: () => void
  onRelease?: () => void
}

export interface HotkeyHandle {
  enabled: Accessor<boolean>
  setEnabled(value: boolean): void
  unregister(): void
}

export function useHotkey(keys: string[], callback: () => void): HotkeyHandle
export function useHotkey(keys: string[], callbacks: HotkeyCallbacks): HotkeyHandle
export function useHotkey(keys: string[], callbackOrCallbacks: (() => void) | HotkeyCallbacks): HotkeyHandle {
  const id = `hk_${++hotkeyCounter}`
  const [enabled, setEnabled] = createSignal(true)
  const callbacks: HotkeyCallbacks =
    typeof callbackOrCallbacks === 'function'
      ? { onPress: callbackOrCallbacks }
      : callbackOrCallbacks

  safeInvokeVoid('input_register_hotkey', { id, keys })
  const unlisten = safeListen<HotkeyEventPayload>(
    'input:hotkey-triggered',
    (event) => {
      if (event.payload.id !== id || !enabled()) return
      const phase = event.payload.phase ?? 'press'
      if (phase === 'release') {
        callbacks.onRelease?.()
        return
      }
      callbacks.onPress?.()
    },
  )
  const unregister = () => {
    safeInvokeVoid('input_unregister_hotkey', { id })
    unlisten.then((fn) => fn())
  }
  if (getOwner()) onCleanup(unregister)
  return { enabled, setEnabled, unregister }
}
