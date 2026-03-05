// Example Trainer — Frida Script
// This script runs inside the target process via Frida.
// __trainer__ is automatically synced with the UI store.
// Types are defined in globals.d.ts — no manual .d.ts maintenance needed.

// Safe export lookup with null guard
const target = Module.findGlobalExportByName('game_tick')

if (target === null) {
  send({ type: 'log', level: 'warn', message: 'game_tick not found, skipping hooks' })
} else {
  Interceptor.attach(target, {
    onEnter(_args: InvocationArguments) {
      // Read store values — these update in real-time from the UI
      if (__trainer__.godMode) {
        // TODO: Patch health to max value
        // Example: Memory.writeU32(healthAddr, 999999)
        send({ type: 'log', level: 'info', message: 'God mode active' })
      }

      if (__trainer__.infiniteAmmo) {
        // TODO: Patch ammo count
        // Example: Memory.writeU32(ammoAddr, 9999)
      }

      if (__trainer__.noRecoil) {
        // TODO: Zero out recoil values
        // Example: Memory.writeFloat(recoilAddr, 0.0)
      }

      if (__trainer__.speedHack !== 1.0) {
        // TODO: Modify game tick speed multiplier
        // Example: Memory.writeFloat(speedAddr, __trainer__.speedHack)
      }

      if (__trainer__.fov !== 90) {
        // TODO: Patch field of view
        // Example: Memory.writeFloat(fovAddr, __trainer__.fov)
      }
    },
  })

  send({ type: 'log', level: 'info', message: 'Hooks installed successfully' })
}

// Write store values from script side (two-way sync)
// __trainer__.set('godMode', true)

// Receive messages from UI
// recv('toggle-feature', (message) => {
//   send({ type: 'log', level: 'info', message: `Received: ${JSON.stringify(message)}` })
// })
