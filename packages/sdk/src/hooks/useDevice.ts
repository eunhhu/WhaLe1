import { createSignal, onMount } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { Device, Session, SpawnOptions, Process } from '../types'
import { safeInvoke, safeInvokeVoid } from '../tauri'

export interface DeviceHandle {
  device: Accessor<Device | null>
  status: Accessor<'searching' | 'connected' | 'disconnected'>
  refresh(): Promise<void>
  spawn(program: string, opts?: SpawnOptions): Promise<Session>
  attach(pid: number): Promise<Session>
  enumerateProcesses(): Promise<Process[]>
  resume(pid: number): Promise<void>
}

interface SpawnAttachPayload {
  sessionId: string
  pid: number
}

type SpawnAttachSupport = 'unknown' | 'supported' | 'unsupported'
let spawnAttachSupport: SpawnAttachSupport = 'unknown'
let spawnAttachRetryAfter = 0
const SPAWN_ATTACH_RETRY_MS = 30_000

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

  onMount(() => { void findDevice() })

  const spawn = async (program: string, opts?: SpawnOptions): Promise<Session> => {
    const dev = device()
    if (!dev) throw new Error('No device connected')

    // Prefer single-roundtrip spawn+attach to reduce IPC latency.
    if (spawnAttachSupport !== 'unsupported' || Date.now() >= spawnAttachRetryAfter) {
      const spawned = await safeInvoke<SpawnAttachPayload>('frida_spawn_attach', { deviceId: dev.id, program, ...(opts || {}) })
      if (spawned?.sessionId && typeof spawned.pid === 'number') {
        spawnAttachSupport = 'supported'
        spawnAttachRetryAfter = 0
        return { id: spawned.sessionId, pid: spawned.pid }
      }
      // Command unavailable (or errored): avoid retrying immediately every spawn.
      spawnAttachSupport = 'unsupported'
      spawnAttachRetryAfter = Date.now() + SPAWN_ATTACH_RETRY_MS
    }

    // Backward-compatible fallback when runtime doesn't expose frida_spawn_attach yet.
    const pid = await safeInvoke<number>('frida_spawn', { deviceId: dev.id, program, ...(opts || {}) })
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

  const enumerateProcesses = async (): Promise<Process[]> => {
    const dev = device()
    if (!dev) throw new Error('No device connected')
    const processes = await safeInvoke<Process[]>('frida_enumerate_processes', { deviceId: dev.id })
    return processes ?? []
  }

  const resume = async (pid: number): Promise<void> => {
    const dev = device()
    if (!dev) throw new Error('No device connected')
    await safeInvokeVoid('frida_resume', { deviceId: dev.id, pid })
  }

  return { device, status, refresh: findDevice, spawn, attach, enumerateProcesses, resume }
}
