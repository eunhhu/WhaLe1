import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
let capturedHandler: ((event: { payload: { id: string; phase?: 'press' | 'release' } }) => void) | undefined
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((_event: string, handler: (event: { payload: { id: string; phase?: 'press' | 'release' } }) => void) => {
    capturedHandler = handler
    return Promise.resolve(() => {})
  }),
}))

describe('useHotkey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedHandler = undefined
  })

  it('should register hotkey via invoke', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const { useHotkey } = await import('../hooks/useHotkey')
    const callback = vi.fn()
    useHotkey(['ctrl', 'f1'], callback)
    expect(invoke).toHaveBeenCalledWith('input_register_hotkey', expect.objectContaining({ keys: ['ctrl', 'f1'] }))
  })

  it('should invoke legacy callback on press only', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const { useHotkey } = await import('../hooks/useHotkey')
    const callback = vi.fn()
    useHotkey(['f1'], callback)
    const id = (invoke as unknown as { mock: { calls: Array<[string, { id: string }]> } }).mock.calls.at(-1)?.[1]?.id
    expect(id).toBeTruthy()

    expect(capturedHandler).toBeTypeOf('function')
    capturedHandler?.({ payload: { id: id!, phase: 'press' } })
    capturedHandler?.({ payload: { id: id!, phase: 'release' } })

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should invoke onPress and onRelease callbacks by phase', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const { useHotkey } = await import('../hooks/useHotkey')
    const onPress = vi.fn()
    const onRelease = vi.fn()

    useHotkey(['ctrl', 'f1'], { onPress, onRelease })
    const id = (invoke as unknown as { mock: { calls: Array<[string, { id: string }]> } }).mock.calls.at(-1)?.[1]?.id
    expect(id).toBeTruthy()

    expect(capturedHandler).toBeTypeOf('function')
    capturedHandler?.({ payload: { id: id!, phase: 'press' } })
    capturedHandler?.({ payload: { id: id!, phase: 'release' } })

    expect(onPress).toHaveBeenCalledTimes(1)
    expect(onRelease).toHaveBeenCalledTimes(1)
  })
})
