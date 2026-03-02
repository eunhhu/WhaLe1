import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

describe('useSimulate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should call input_simulate_key_press invoke', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const { useSimulate } = await import('../hooks/useSimulate')

    const sim = useSimulate()
    sim.keyPress('enter')

    expect(invoke).toHaveBeenCalledWith('input_simulate_key_press', { key: 'enter' })
  })

  it('should call input_simulate_key_down invoke', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const { useSimulate } = await import('../hooks/useSimulate')

    const sim = useSimulate()
    sim.keyDown('shift')

    expect(invoke).toHaveBeenCalledWith('input_simulate_key_down', { key: 'shift' })
  })

  it('should call input_simulate_key_up invoke', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const { useSimulate } = await import('../hooks/useSimulate')

    const sim = useSimulate()
    sim.keyUp('shift')

    expect(invoke).toHaveBeenCalledWith('input_simulate_key_up', { key: 'shift' })
  })

  it('should call input_simulate_mouse_click invoke with coordinates', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const { useSimulate } = await import('../hooks/useSimulate')

    const sim = useSimulate()
    sim.mouseClick(100, 200)

    expect(invoke).toHaveBeenCalledWith('input_simulate_mouse_click', { x: 100, y: 200 })
  })

  it('should call input_simulate_mouse_move invoke with coordinates', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const { useSimulate } = await import('../hooks/useSimulate')

    const sim = useSimulate()
    sim.mouseMove(500, 300)

    expect(invoke).toHaveBeenCalledWith('input_simulate_mouse_move', { x: 500, y: 300 })
  })
})
