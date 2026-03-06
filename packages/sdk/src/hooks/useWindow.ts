import { createSignal, getOwner, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'
import { safeInvoke, safeInvokeVoid, safeListen } from '../tauri'

export interface WindowHandle {
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

export function useWindow(id: string): WindowHandle {
  const [visible, setVisible] = createSignal(true)
  void safeInvoke<boolean>('window_is_visible', { id }).then((currentVisible) => {
    if (typeof currentVisible === 'boolean') {
      setVisible(currentVisible)
    }
  })
  const unlisten = safeListen<{ id: string; visible: boolean }>(
    'window:visibility-changed',
    (event) => {
      if (event.payload.id === id) setVisible(event.payload.visible)
    },
  )
  if (getOwner()) onCleanup(() => { unlisten.then((fn) => fn()) })
  return {
    show: () => safeInvokeVoid('window_show', { id }),
    hide: () => safeInvokeVoid('window_hide', { id }),
    toggle: () => safeInvokeVoid('window_toggle', { id }),
    close: () => safeInvokeVoid('window_close', { id }),
    visible,
    setPosition: (x: number, y: number) => safeInvokeVoid('window_set_position', { id, x, y }),
    setSize: (w: number, h: number) => safeInvokeVoid('window_set_size', { id, width: w, height: h }),
    setAlwaysOnTop: (value: boolean) => safeInvokeVoid('window_set_always_on_top', { id, value }),
    center: () => safeInvokeVoid('window_center', { id }),
  }
}
