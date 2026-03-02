# WhaLe

A game trainer framework built on Tauri 2.x, rdev, and Frida. Write trainer UIs in SolidJS and TypeScript, manipulate game memory with Frida scripts, and synchronize state bidirectionally between UI, Rust, and Frida through a unified Store system.

## Architecture

```
packages/
  sdk/           - @whale/sdk   — SolidJS hooks + Store
  ui/            - @whale/ui    — UI component library
  cli/           - @whale/cli   — CLI tooling
  tauri-runtime/ - Rust backend — Tauri + rdev + Frida
apps/
  example/       - Example trainer project
```

Managed as a bun workspace monorepo.

## Core Concepts

### createSyncStore

The central primitive. Creates a reactive store that stays in sync across UI windows, the Rust backend, and injected Frida scripts.

```ts
import { createSyncStore } from '@whale/sdk'

const store = createSyncStore('trainer', {
  speedHack: false,
  speedMultiplier: 1.0,
  godMode: false,
})

// Read state
store.speedHack        // false

// Write state — propagates to Rust and Frida automatically
store.setSpeedHack(true)
store.setSpeedMultiplier(2.5)
```

Setters follow a `setXxx` naming convention derived via Proxy. Each write invokes the Rust `store_set` command and emits a `store:changed` event to all subscribed windows. State is persisted to disk with a 500ms debounce.

### Window Management

```ts
import { useWindow, useCurrentWindow } from '@whale/sdk'

// Control any named window
const overlay = useWindow('overlay')
overlay.show()
overlay.hide()
overlay.toggle()
overlay.setPosition(100, 200)
overlay.setSize(400, 300)
overlay.setAlwaysOnTop(true)
overlay.center()

// Control the current window
const win = useCurrentWindow()
win.hide()
```

### Input System

```ts
import { useHotkey, useSimulate } from '@whale/sdk'

// Global hotkey via rdev
useHotkey(['ctrl', 'f1'], () => {
  store.setSpeedHack(!store.speedHack)
})

const overlay = useWindow('overlay')
useHotkey(['ctrl', 'f2'], () => overlay.toggle())

// Keyboard and mouse simulation
const sim = useSimulate()
sim.keyPress('f')
sim.keyDown('shift')
sim.keyUp('shift')
sim.mouseClick('left')
sim.mouseMove(960, 540)
```

### Frida Integration

```ts
import { useDevices, useDevice, useSession } from '@whale/sdk'

// List available devices
const { devices } = useDevices()

// Attach to a process
const device = useDevice('local')
const session = await device.attach('GameProcess.exe')
// or spawn: const session = await device.spawn('game.exe', { argv: [] })

// Inject a script
const handle = useSession(session)
const script = await handle.loadScript(`
  const base = Module.getBaseAddress('game.exe')
  __whale_store__.speedMultiplier  // read from synced store
  __whale_store__.setSpeedHack     // write back to UI
`)
```

The `__whale_store__` Proxy is automatically injected into every Frida script (preamble). Store writes from Frida are batched and flushed to Rust every 16ms.

### UI Components

```tsx
import { Button, Text, Switch, Slider, Flex } from '@whale/ui'

function TrainerPanel() {
  return (
    <Flex direction="column" gap={8}>
      <Text size="sm" weight="bold">Speed Hack</Text>
      <Switch
        checked={store.speedHack}
        onChange={(v) => store.setSpeedHack(v)}
      />
      <Slider
        min={1}
        max={10}
        value={store.speedMultiplier}
        onChange={(v) => store.setSpeedMultiplier(v)}
      />
      <Button variant="primary" onClick={() => store.setGodMode(!store.godMode)}>
        Toggle God Mode
      </Button>
    </Flex>
  )
}
```

Components are styled for a dark trainer theme.

## Quick Start

```ts
import { createSyncStore, useWindow, useHotkey } from '@whale/sdk'

const store = createSyncStore('trainer', {
  speedHack: false,
  speedMultiplier: 1.0,
})

useHotkey(['ctrl', 'f1'], () => {
  store.setSpeedHack(!store.speedHack)
})

const overlay = useWindow('overlay')
useHotkey(['ctrl', 'f2'], () => overlay.toggle())
```

## Development

```bash
bun install       # install dependencies
bun test          # run all tests (vitest)
bun run dev       # development server
bun run build     # production build
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Tauri 2.x (Rust) |
| Frontend | SolidJS 1.9+ |
| Global input | rdev 0.5 |
| Process injection | frida-rust |
| Language | TypeScript 5.7+ |
| Bundler | Vite |
| Test | vitest |
| Package manager | bun |

## Test Coverage

- Rust: 39 tests — StoreManager (19), Bridge (10), Preamble (10)
- SDK: 28 tests across 8 test files
- Total: 67 tests, all passing

## License

MIT
