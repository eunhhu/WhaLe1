import { invoke } from '@tauri-apps/api/core'

export interface SimulateHandle {
  keyPress(key: string): void
  keyDown(key: string): void
  keyUp(key: string): void
  mouseClick(x: number, y: number): void
  mouseMove(x: number, y: number): void
}

export function useSimulate(): SimulateHandle {
  return {
    keyPress: (key: string) => invoke('input_simulate_key_press', { key }),
    keyDown: (key: string) => invoke('input_simulate_key_down', { key }),
    keyUp: (key: string) => invoke('input_simulate_key_up', { key }),
    mouseClick: (x: number, y: number) => invoke('input_simulate_mouse_click', { x, y }),
    mouseMove: (x: number, y: number) => invoke('input_simulate_mouse_move', { x, y }),
  }
}
