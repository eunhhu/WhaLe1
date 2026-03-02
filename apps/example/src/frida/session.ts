import { createEffect } from 'solid-js'
import { useDevice, useSession } from '@whale/sdk'
import whaleConfig from '../../whale.config'

/**
 * Setup Frida session for trainer.
 * Connects to local device and logs available processes.
 *
 * Call this inside a SolidJS reactive root (e.g., from main.tsx).
 */
export function setupTrainerSession() {
  const device = useDevice({ type: 'local' })
  const configuredScripts = whaleConfig.frida?.scripts ?? []

  const attachAndLoadConfiguredScripts = async (pid: number) => {
    const attached = await device.attach(pid)
    const session = useSession(attached)
    const scriptIds: string[] = []

    for (const script of configuredScripts) {
      const loaded = await session.loadScriptFile(script.entry, script.store)
      scriptIds.push(loaded.id)
    }
    return { session, scriptIds }
  }

  createEffect(() => {
    const dev = device.device()
    const status = device.status()

    if (status !== 'connected' || !dev) return

    console.log('[trainer] device connected:', dev.name)
    console.log('[trainer] configured frida scripts:', configuredScripts.length)
    configuredScripts.forEach((script, index) => {
      console.log(`  [${index}] ${script.entry}${script.store ? ` (store=${script.store})` : ''}`)
    })

    // List running processes for reference
    device.enumerateProcesses().then((procs) => {
      console.log('[trainer] running processes:', procs.length)
      procs.slice(0, 10).forEach((p) => {
        console.log(`  [${p.pid}] ${p.name}`)
      })
    })
  })

  return { device, configuredScripts, attachAndLoadConfiguredScripts }
}
