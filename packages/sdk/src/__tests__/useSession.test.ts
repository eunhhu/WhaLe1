import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: vi.fn(() => ({ label: 'main' })),
}))

let capturedDetachedHandler: ((event: { payload: { sessionId: string } }) => void) | undefined
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((_event: string, handler: (event: { payload: { sessionId: string } }) => void) => {
    capturedDetachedHandler = handler
    return Promise.resolve(() => {})
  }),
}))

describe('useSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedDetachedHandler = undefined
    ;(globalThis as { window?: unknown }).window = { __TAURI_INTERNALS__: {} }
  })

  it('should call frida_load_script invoke with session id and code', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const mockInvoke = vi.mocked(invoke)
    mockInvoke.mockResolvedValueOnce('script-123' as never)

    const { useSession } = await import('../hooks/useSession')

    const session = useSession({ id: 'sess-1', pid: 1234 })
    const script = await session.loadScript('console.log("hello")')

    expect(invoke).toHaveBeenCalledWith('frida_load_script', {
      sessionId: 'sess-1',
      code: 'console.log("hello")',
    })
    expect(script).toEqual({ id: 'script-123' })
  })

  it('should call frida_load_script_file invoke with session id and path', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const mockInvoke = vi.mocked(invoke)
    mockInvoke.mockResolvedValueOnce('script-456' as never)

    const { useSession } = await import('../hooks/useSession')

    const session = useSession({ id: 'sess-2', pid: 5678 })
    const script = await session.loadScriptFile('/tmp/hook.js')

    expect(invoke).toHaveBeenCalledWith('frida_load_script_file', {
      sessionId: 'sess-2',
      path: '/tmp/hook.js',
    })
    expect(script).toEqual({ id: 'script-456' })
  })

  it('should call frida_detach invoke and set status to detached', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const { useSession } = await import('../hooks/useSession')

    const session = useSession({ id: 'sess-3', pid: 9999 })

    expect(session.status()).toBe('attached')

    session.detach()

    expect(invoke).toHaveBeenCalledWith('frida_detach', { sessionId: 'sess-3' })
    expect(session.status()).toBe('detached')
  })

  it('should start with attached status', async () => {
    const { useSession } = await import('../hooks/useSession')

    const session = useSession({ id: 'sess-4', pid: 100 })
    expect(session.status()).toBe('attached')
  })

  it('should listen for frida:session-detached events', async () => {
    const { listen } = await import('@tauri-apps/api/event')

    const { useSession } = await import('../hooks/useSession')
    useSession({ id: 'sess-5', pid: 200 })

    expect(listen).toHaveBeenCalledWith('frida:session-detached', expect.any(Function))
  })

  it('should transition to detached on frida:session-detached event', async () => {
    const { useSession } = await import('../hooks/useSession')
    const session = useSession({ id: 'sess-6', pid: 201 })

    expect(session.status()).toBe('attached')
    capturedDetachedHandler?.({ payload: { sessionId: 'sess-6' } })
    expect(session.status()).toBe('detached')
  })

  it('integrated mode should detach backend session even when no scripts are configured', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const mockInvoke = vi.mocked(invoke)

    const { useSession } = await import('../hooks/useSession')
    const device = {
      device: () => ({ id: 'usb-1', name: 'USB Device', type: 'usb' as const }),
      status: () => 'connected' as const,
      refresh: vi.fn(async () => {}),
      spawn: vi.fn(async () => ({ id: 'sess-spawn', pid: 123 })),
      attach: vi.fn(async () => ({ id: 'sess-int', pid: 42 })),
      enumerateProcesses: vi.fn(async () => []),
      resume: vi.fn(async () => {}),
    }

    const integrated = useSession(device, { scripts: [] })
    await integrated.attachToProcess(42)
    expect(integrated.phase()).toBe('scripted')

    integrated.detach()
    expect(invoke).toHaveBeenCalledWith('frida_detach', { sessionId: 'sess-int' })
  })

  it('integrated mode should start from current device status', async () => {
    const { useSession } = await import('../hooks/useSession')
    const makeDevice = (status: 'searching' | 'connected' | 'disconnected') => ({
      device: () => (status === 'connected' ? { id: 'usb-1', name: 'USB Device', type: 'usb' as const } : null),
      status: () => status,
      refresh: vi.fn(async () => {}),
      spawn: vi.fn(async () => ({ id: 'sess-spawn', pid: 123 })),
      attach: vi.fn(async () => ({ id: 'sess-int', pid: 42 })),
      enumerateProcesses: vi.fn(async () => []),
      resume: vi.fn(async () => {}),
    })

    expect(useSession(makeDevice('connected')).phase()).toBe('connected')
    expect(useSession(makeDevice('searching')).phase()).toBe('searching')
    expect(useSession(makeDevice('disconnected')).phase()).toBe('idle')
  })
})
