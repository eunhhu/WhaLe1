// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: vi.fn(() => ({ label: 'main' })),
}))

describe('isTauriRuntime', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns false when window is unavailable', async () => {
    vi.stubGlobal('window', undefined)
    const { isTauriRuntime } = await import('../tauri')
    expect(isTauriRuntime()).toBe(false)
  })

  it('detects browser tauri globals without poisoning later checks', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    const { isTauriRuntime } = await import('../tauri')
    expect(isTauriRuntime()).toBe(true)

    vi.stubGlobal('window', undefined)
    expect(isTauriRuntime()).toBe(true)
  })
})
