import { createSignal, getOwner, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'
import { safeInvokeVoid, safeListen } from '../tauri'

let hotkeyCounter = 0

export interface HotkeyHandle {
  enabled: Accessor<boolean>
  setEnabled(value: boolean): void
  unregister(): void
}

export function useHotkey(keys: string[], callback: () => void): HotkeyHandle {
  const id = `hk_${++hotkeyCounter}`
  const [enabled, setEnabled] = createSignal(true)
  safeInvokeVoid('input_register_hotkey', { id, keys })
  const unlisten = safeListen<{ id: string }>(
    'input:hotkey-triggered',
    (event) => { if (event.payload.id === id && enabled()) callback() },
  )
  const unregister = () => {
    safeInvokeVoid('input_unregister_hotkey', { id })
    unlisten.then((fn) => fn())
  }
  if (getOwner()) onCleanup(unregister)
  return { enabled, setEnabled, unregister }
}
