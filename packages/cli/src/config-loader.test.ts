// @vitest-environment node
// @vitest-environment node
// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TextDecoder, TextEncoder } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'

const tempRoots: string[] = []
const NodeUint8Array = new TextEncoder().encode('').constructor as typeof Uint8Array

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'whale-config-loader-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  vi.unmock('./package-meta.js')
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('loadConfig', () => {
  it('resolves config imports for custom cli scopes', async () => {
    const root = createTempRoot()
    const configPath = join(root, 'whale.config.ts')
    writeFileSync(
      configPath,
      [
        "import { defineConfig } from '@acme/cli'",
        '',
        'export default defineConfig({',
        '  app: {',
        "    name: 'Scoped App',",
        "    version: '0.1.0',",
        "    identifier: 'com.acme.app',",
        '  },',
        '  windows: {',
        '    main: {',
        "      entry: './src/ui/windows/main.tsx',",
        '    },',
        '  },',
        '})',
      ].join('\n'),
      'utf-8',
    )

    vi.doMock('./package-meta.js', () => ({
      buildCliImportAliases: (cliConfigDistPath: string) => ({
        '@acme/cli': cliConfigDistPath,
        '@acme/cli/config': cliConfigDistPath,
      }),
      readCliPackageMeta: () => ({
        cliPackageName: '@acme/cli',
        sdkPackageName: '@acme/sdk',
        uiPackageName: '@acme/ui',
        version: '1.2.3',
      }),
    }))
    vi.stubGlobal('TextEncoder', TextEncoder)
    vi.stubGlobal('TextDecoder', TextDecoder)
    vi.stubGlobal('Uint8Array', NodeUint8Array)

    const { loadConfig } = await import('./config-loader.js')
    const config = await loadConfig(configPath)

    expect(config.app.name).toBe('Scoped App')
    expect(config.windows.main.entry).toBe('./src/ui/windows/main.tsx')
  })
})
