import { useWindow, type WindowHandle } from './useWindow'
import { getCurrentWindowLabel } from '../tauri'

export interface CurrentWindowHandle extends WindowHandle {
  id: string
}

export function useCurrentWindow(): CurrentWindowHandle {
  const id = getCurrentWindowLabel() ?? 'main'
  const handle = useWindow(id)
  return { ...handle, id }
}
