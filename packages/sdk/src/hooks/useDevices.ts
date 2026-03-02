import { createSignal, onMount } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { Device } from '../types'
import { safeInvoke } from '../tauri'

export interface DevicesHandle {
  devices: Accessor<Device[]>
  refresh(): void
}

export function useDevices(): DevicesHandle {
  const [devices, setDevices] = createSignal<Device[]>([])
  const refresh = async () => {
    const list = (await safeInvoke<Device[]>('frida_list_devices')) ?? []
    setDevices(list)
  }
  onMount(refresh)
  return { devices, refresh }
}
