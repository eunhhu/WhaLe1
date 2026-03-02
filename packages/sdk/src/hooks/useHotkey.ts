import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { createSignal, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'

let hotkeyCounter = 0

export interface HotkeyHandle {
  enabled: Accessor<boolean>
  setEnabled(value: boolean): void
  unregister(): void
}

export function useHotkey(keys: string[], callback: () => void): HotkeyHandle {
  const id = `hk_${++hotkeyCounter}`
  const [enabled, setEnabled] = createSignal(true)
  invoke('input_register_hotkey', { id, keys })
  const unlisten = listen<{ id: string }>(
    'input:hotkey-triggered',
    (event) => { if (event.payload.id === id && enabled()) callback() },
  )
  const unregister = () => {
    invoke('input_unregister_hotkey', { id })
    unlisten.then((fn) => fn())
  }
  try { onCleanup(unregister) } catch {}
  return { enabled, setEnabled, unregister }
}
