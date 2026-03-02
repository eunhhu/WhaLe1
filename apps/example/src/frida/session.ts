import { createEffect } from 'solid-js'
import { useDevice } from '@whale/sdk'

/**
 * Setup Frida session for trainer.
 * Connects to local device and logs available processes.
 *
 * Call this inside a SolidJS reactive root (e.g., from main.tsx).
 */
export function setupTrainerSession() {
  const device = useDevice({ type: 'local' })

  createEffect(() => {
    const dev = device.device()
    const status = device.status()

    if (status !== 'connected' || !dev) return

    console.log('[trainer] device connected:', dev.name)

    // List running processes for reference
    device.enumerateProcesses().then((procs) => {
      console.log('[trainer] running processes:', procs.length)
      procs.slice(0, 10).forEach((p) => {
        console.log(`  [${p.pid}] ${p.name}`)
      })
    })
  })

  return { device }
}
