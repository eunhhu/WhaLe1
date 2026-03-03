import { onMount } from 'solid-js'
import { useDevice, isTauriRuntime } from '@whale1/sdk'

/**
 * Minimal Frida session setup.
 * Connects to a USB device on mount.
 */
export function setupSession() {
  const device = useDevice({ type: 'usb' })

  onMount(() => {
    if (isTauriRuntime()) {
      void device.refresh()
    }
  })

  return { device }
}
