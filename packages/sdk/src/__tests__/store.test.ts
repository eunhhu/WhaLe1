import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))

describe('createSyncStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create a store with default values', async () => {
    const { createSyncStore } = await import('../store')

    const store = createSyncStore('test', {
      count: 0,
      name: 'hello',
      active: false,
    })

    expect(store.count).toBe(0)
    expect(store.name).toBe('hello')
    expect(store.active).toBe(false)
  })

  it('should provide setter functions for each key', async () => {
    const { createSyncStore } = await import('../store')

    const store = createSyncStore('test', {
      count: 0,
    })

    expect(typeof store.setCount).toBe('function')
  })

  it('should call invoke on set', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const { createSyncStore } = await import('../store')

    const store = createSyncStore('test', {
      count: 0,
    })

    store.setCount(42)

    expect(invoke).toHaveBeenCalledWith('store_set', {
      name: 'test',
      key: 'count',
      value: 42,
    })
  })
})
