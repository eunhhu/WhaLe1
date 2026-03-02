import { createSignal, onMount } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { Device, Session, SpawnOptions } from '../types'
import { safeInvoke } from '../tauri'

export interface DeviceHandle {
  device: Accessor<Device | null>
  status: Accessor<'searching' | 'connected' | 'disconnected'>
  spawn(bundleId: string, opts?: SpawnOptions): Promise<Session>
  attach(pid: number): Promise<Session>
}

export function useDevice(filter?: { type?: 'usb' | 'local' | 'remote'; id?: string }): DeviceHandle {
  const [device, setDevice] = createSignal<Device | null>(null)
  const [status, setStatus] = createSignal<'searching' | 'connected' | 'disconnected'>('searching')

  const findDevice = async () => {
    try {
      setStatus('searching')
      const devices = (await safeInvoke<Device[]>('frida_list_devices')) ?? []
      const found = devices.find((d) => {
        if (filter?.id && d.id !== filter.id) return false
        if (filter?.type && d.type !== filter.type) return false
        return true
      })
      if (found) { setDevice(found); setStatus('connected') }
      else { setStatus('disconnected') }
    } catch { setStatus('disconnected') }
  }

  onMount(() => { findDevice() })

  const spawn = async (bundleId: string, opts?: SpawnOptions): Promise<Session> => {
    const dev = device()
    if (!dev) throw new Error('No device connected')
    const pid = await safeInvoke<number>('frida_spawn', { deviceId: dev.id, bundleId, ...(opts || {}) })
    if (typeof pid !== 'number') throw new Error('Failed to spawn process')
    const sessionId = await safeInvoke<string>('frida_attach', { deviceId: dev.id, pid })
    if (!sessionId) throw new Error('Failed to attach session')
    return { id: sessionId, pid }
  }

  const attach = async (pid: number): Promise<Session> => {
    const dev = device()
    if (!dev) throw new Error('No device connected')
    const sessionId = await safeInvoke<string>('frida_attach', { deviceId: dev.id, pid })
    if (!sessionId) throw new Error('Failed to attach session')
    return { id: sessionId, pid }
  }

  return { device, status, spawn, attach }
}
