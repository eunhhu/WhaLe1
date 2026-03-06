// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'solid-js'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

describe('useDevices', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
  })

  async function mountDevices() {
    const { useDevices } = await import('../hooks/useDevices')
    let dispose: (() => void) | undefined
    const handle = createRoot((d) => {
      dispose = d
      return useDevices()
    })
    await Promise.resolve()
    return { handle, dispose }
  }

  it('should call frida_list_devices invoke on refresh', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const mockInvoke = vi.mocked(invoke)
    mockInvoke.mockResolvedValue([
      { id: 'local', name: 'Local', type: 'local' },
      { id: 'usb-001', name: 'iPhone', type: 'usb' },
    ] as never)

    const { handle, dispose } = await mountDevices()
    await vi.waitFor(() => expect(handle.devices()).toHaveLength(2))
    mockInvoke.mockClear()

    await handle.refresh()

    expect(invoke).toHaveBeenCalledWith('frida_list_devices')
    dispose?.()
  })

  it('should update devices list after refresh', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const mockInvoke = vi.mocked(invoke)
    const mockDevices = [
      { id: 'local', name: 'Local System', type: 'local' },
      { id: 'usb-abc', name: 'Test Device', type: 'usb' },
    ]
    mockInvoke.mockResolvedValue(mockDevices as never)

    const { handle, dispose } = await mountDevices()
    await vi.waitFor(() => expect(handle.devices()).toEqual(mockDevices))
    await handle.refresh()
    expect(handle.devices()).toEqual(mockDevices)
    dispose?.()
  })

  it('should refresh and update with new device list', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const mockInvoke = vi.mocked(invoke)

    // First refresh: 1 device
    mockInvoke.mockResolvedValueOnce([
      { id: 'local', name: 'Local', type: 'local' },
    ] as never)

    const { handle, dispose } = await mountDevices()
    await vi.waitFor(() => expect(handle.devices()).toHaveLength(1))

    // Second refresh: 2 devices (new USB connected)
    mockInvoke.mockResolvedValueOnce([
      { id: 'local', name: 'Local', type: 'local' },
      { id: 'usb-new', name: 'New Device', type: 'usb' },
    ] as never)

    await handle.refresh()
    expect(handle.devices()).toHaveLength(2)
    expect(handle.devices()[1].id).toBe('usb-new')
    dispose?.()
  })

  it('should handle empty device list', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const mockInvoke = vi.mocked(invoke)
    mockInvoke.mockResolvedValue([] as never)

    const { handle, dispose } = await mountDevices()
    await vi.waitFor(() => expect(handle.devices()).toEqual([]))
    await handle.refresh()
    dispose?.()
  })
})
