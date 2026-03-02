import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((_event: string, _handler: Function) => Promise.resolve(() => {})),
}))

describe('useHotkey', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('should register hotkey via invoke', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const { useHotkey } = await import('../hooks/useHotkey')
    const callback = vi.fn()
    useHotkey(['ctrl', 'f1'], callback)
    expect(invoke).toHaveBeenCalledWith('input_register_hotkey', expect.objectContaining({ keys: ['ctrl', 'f1'] }))
  })
})
