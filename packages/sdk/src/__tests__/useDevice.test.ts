// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'solid-js'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: vi.fn(() => ({ label: 'main' })),
}))

describe('useDevice', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
  })

  async function mountDevice() {
    const { useDevice } = await import('../hooks/useDevice')
    let dispose: (() => void) | undefined
    const dev = createRoot((d) => {
      dispose = d
      return useDevice({ type: 'usb' })
    })
    await Promise.resolve()
    return { dev, dispose }
  }

  it('should return device state and spawn/attach methods', async () => {
    const { dev, dispose } = await mountDevice()
    expect(typeof dev.refresh).toBe('function')
    expect(typeof dev.spawn).toBe('function')
    expect(typeof dev.attach).toBe('function')
    expect(typeof dev.status).toBe('function')
    dispose?.()
  })

  it('should call frida_spawn_attach with program payload key', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const mockInvoke = vi.mocked(invoke)
    mockInvoke
      .mockResolvedValueOnce([
        { id: 'usb-1', name: 'Test iPhone', type: 'usb' },
      ] as never)
      .mockResolvedValueOnce({ sessionId: 'sess-1', pid: 4242 } as never)

    const { dev, dispose } = await mountDevice()
    await vi.waitFor(() => expect(dev.device()?.id).toBe('usb-1'))

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

    const { dev, dispose } = await mountDevice()
    await vi.waitFor(() => expect(dev.device()?.id).toBe('usb-1'))

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

  it('should cache unsupported frida_spawn_attach and skip retry on next spawn', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const mockInvoke = vi.mocked(invoke)
    mockInvoke
      .mockResolvedValueOnce([
        { id: 'usb-1', name: 'Test iPhone', type: 'usb' },
      ] as never)
      .mockResolvedValueOnce(undefined as never) // first spawn_attach unsupported
      .mockResolvedValueOnce(1001 as never) // first spawn
      .mockResolvedValueOnce('sess-1' as never) // first attach
      .mockResolvedValueOnce(1002 as never) // second spawn
      .mockResolvedValueOnce('sess-2' as never) // second attach

    const { dev, dispose } = await mountDevice()
    await vi.waitFor(() => expect(dev.device()?.id).toBe('usb-1'))

    const s1 = await dev.spawn('com.example.one')
    const s2 = await dev.spawn('com.example.two')
    expect(s1).toEqual({ id: 'sess-1', pid: 1001 })
    expect(s2).toEqual({ id: 'sess-2', pid: 1002 })

    const calls = mockInvoke.mock.calls.map(([cmd]) => cmd)
    const spawnAttachCalls = calls.filter((cmd) => cmd === 'frida_spawn_attach')
    expect(spawnAttachCalls.length).toBe(1)

    dispose?.()
  })
})
