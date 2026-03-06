import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateTauriConf } from './tauri-conf.js'
import type { WhaleConfig } from '../config.js'

const baseConfig: WhaleConfig = {
  app: {
    name: 'Whale App',
    version: '0.1.0',
    identifier: 'com.whale.test',
  },
  windows: {
    main: {
      entry: './src/ui/windows/main.tsx',
    },
    overlay: {
      entry: './src/ui/windows/overlay.tsx',
      title: 'Overlay HUD',
      transparent: true,
    },
  },
}

describe('generateTauriConf', () => {
  it('maps window titles from config and defaults to app name', () => {
    const conf = generateTauriConf(baseConfig, 'production', process.cwd())
    const main = conf.app.windows.find((w) => w.label === 'main')
    const overlay = conf.app.windows.find((w) => w.label === 'overlay')

    expect(main?.title).toBe('Whale App')
    expect(overlay?.title).toBe('Overlay HUD')
    expect(conf.productName).toBe('Whale App')
  })

  it('adds devtools window title in development mode', () => {
    const conf = generateTauriConf(baseConfig, 'development', process.cwd())
    const devtools = conf.app.windows.find((w) => w.label === '__devtools__')
    expect(devtools?.title).toBe('Whale App - DevTools')
  })

  it('enables macOS private API when transparent windows exist', () => {
    const conf = generateTauriConf(baseConfig, 'development', process.cwd())
    expect(conf.app.macOSPrivateApi).toBe(true)
  })

  it('disables global tauri injection and bundles frida scripts as resources', () => {
    const conf = generateTauriConf(
      {
        ...baseConfig,
        frida: {
          scripts: [{ entry: './packages/sdk/src/index.ts', store: 'trainer' }],
        },
      },
      'production',
      process.cwd(),
    )

    expect(conf.app.withGlobalTauri).toBe(false)
    expect(conf.bundle.resources).toEqual({
      [resolve(process.cwd(), 'packages/sdk/src/index.ts')]: 'packages/sdk/src/index.ts',
    })
  })
})
