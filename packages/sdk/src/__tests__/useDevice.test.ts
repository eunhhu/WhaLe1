import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'solid-js'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))

describe('useDevice', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('should return device state and spawn/attach methods', async () => {
    const { useDevice } = await import('../hooks/useDevice')
    const dev = useDevice({ type: 'usb' })
    expect(typeof dev.refresh).toBe('function')
    expect(typeof dev.spawn).toBe('function')
    expect(typeof dev.attach).toBe('function')
    expect(typeof dev.status).toBe('function')
  })

  it('should call frida_spawn_attach with program payload key', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const mockInvoke = vi.mocked(invoke)
    mockInvoke
      .mockResolvedValueOnce([
        { id: 'usb-1', name: 'Test iPhone', type: 'usb' },
      ] as never)
      .mockResolvedValueOnce({ sessionId: 'sess-1', pid: 4242 } as never)

    const { useDevice } = await import('../hooks/useDevice')
    let dispose: (() => void) | undefined
    const dev = createRoot((d) => {
      dispose = d
      return useDevice({ type: 'usb' })
    })

    await dev.refresh()

    const session = await dev.spawn('com.example.game')
    expect(session).toEqual({ id: 'sess-1', pid: 4242 })
    expect(invoke).toHaveBeenCalledWith('frida_spawn_attach', expect.objectContaining({
      deviceId: 'usb-1',
      program: 'com.example.game',
    }))

    dispose?.()
  })

  it('should fallback to frida_spawn + frida_attach when frida_spawn_attach is unavailable', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const mockInvoke = vi.mocked(invoke)
    mockInvoke
      .mockResolvedValueOnce([
        { id: 'usb-1', name: 'Test iPhone', type: 'usb' },
      ] as never)
      .mockResolvedValueOnce(undefined as never) // frida_spawn_attach unavailable
      .mockResolvedValueOnce(4242 as never) // frida_spawn
      .mockResolvedValueOnce('sess-legacy' as never) // frida_attach

    const { useDevice } = await import('../hooks/useDevice')
    let dispose: (() => void) | undefined
    const dev = createRoot((d) => {
      dispose = d
      return useDevice({ type: 'usb' })
    })

    await dev.refresh()

    const session = await dev.spawn('com.example.legacy')
    expect(session).toEqual({ id: 'sess-legacy', pid: 4242 })
    expect(invoke).toHaveBeenCalledWith('frida_spawn_attach', expect.objectContaining({
      deviceId: 'usb-1',
      program: 'com.example.legacy',
    }))
    expect(invoke).toHaveBeenCalledWith('frida_spawn', expect.objectContaining({
      deviceId: 'usb-1',
      program: 'com.example.legacy',
    }))
    expect(invoke).toHaveBeenCalledWith('frida_attach', expect.objectContaining({
      deviceId: 'usb-1',
      pid: 4242,
    }))

    dispose?.()
  })
})
