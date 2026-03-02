import { createSignal, onMount } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { Device, Session, SpawnOptions, Process } from '../types'
import { safeInvoke, safeInvokeVoid } from '../tauri'

export interface DeviceHandle {
  device: Accessor<Device | null>
  status: Accessor<'searching' | 'connected' | 'disconnected'>
  spawn(program: string, opts?: SpawnOptions): Promise<Session>
  attach(pid: number): Promise<Session>
  enumerateProcesses(): Promise<Process[]>
  resume(pid: number): Promise<void>
}

export function useDevice(filter?: { type?: 'usb' | 'local' | 'remote'; id?: string }): DeviceHandle {
  const [device, setDevice] = createSignal<Device | null>(null)
  const [status, setStatus] = createSignal<'searching' | 'connected' | 'disconnected'>('searching')

  const findDevice = async () => {
    try {
      setStatus('searching')
      console.log('[whale:sdk] findDevice: searching with filter', filter)
      const devices = (await safeInvoke<Device[]>('frida_list_devices')) ?? []
      const found = devices.find((d) => {
        if (filter?.id && d.id !== filter.id) return false
        if (filter?.type && d.type !== filter.type) return false
        return true
      })
      if (found) { setDevice(found); setStatus('connected'); console.log('[whale:sdk] findDevice: connected to', found.name) }
      else { setStatus('disconnected'); console.log('[whale:sdk] findDevice: no device found') }
    } catch { setStatus('disconnected') }
  }

  onMount(() => { findDevice() })

  const spawn = async (program: string, opts?: SpawnOptions): Promise<Session> => {
    const dev = device()
    if (!dev) throw new Error('No device connected')
    console.log('[whale:sdk] spawn:', program, opts)
    const pid = await safeInvoke<number>('frida_spawn', { deviceId: dev.id, bundleId: program, ...(opts || {}) })
    if (typeof pid !== 'number') throw new Error('Failed to spawn process')
    const sessionId = await safeInvoke<string>('frida_attach', { deviceId: dev.id, pid })
    if (!sessionId) throw new Error('Failed to attach session')
    console.log('[whale:sdk] spawn: attached session', sessionId, 'pid', pid)
    return { id: sessionId, pid }
  }

  const attach = async (pid: number): Promise<Session> => {
    const dev = device()
    if (!dev) throw new Error('No device connected')
    console.log('[whale:sdk] attach: pid', pid)
    const sessionId = await safeInvoke<string>('frida_attach', { deviceId: dev.id, pid })
    if (!sessionId) throw new Error('Failed to attach session')
    console.log('[whale:sdk] attach: session', sessionId)
    return { id: sessionId, pid }
  }

  const enumerateProcesses = async (): Promise<Process[]> => {
    const dev = device()
    if (!dev) throw new Error('No device connected')
    console.log('[whale:sdk] enumerateProcesses: device', dev.id)
    const processes = await safeInvoke<Process[]>('frida_enumerate_processes', { deviceId: dev.id })
    console.log('[whale:sdk] enumerateProcesses: found', processes?.length ?? 0, 'processes')
    return processes ?? []
  }

  const resume = async (pid: number): Promise<void> => {
    const dev = device()
    if (!dev) throw new Error('No device connected')
    console.log('[whale:sdk] resume: pid', pid)
    await safeInvokeVoid('frida_resume', { deviceId: dev.id, pid })
    console.log('[whale:sdk] resume: done')
  }

  return { device, status, spawn, attach, enumerateProcesses, resume }
}
