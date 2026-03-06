import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WhaleConfig } from '../config.js'

const tempRoots: string[] = []

function createProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'whale-html-entry-scope-'))
  tempRoots.push(root)
  mkdirSync(join(root, 'src', 'ui', 'windows'), { recursive: true })
  writeFileSync(join(root, 'src', 'ui', 'windows', 'main.tsx'), 'export default function Main() { return null }')
  return root
}

afterEach(() => {
  vi.resetModules()
  vi.unmock('../package-meta.js')
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('generateHtmlEntries custom scope', () => {
  it('uses the current sdk package name for devtools bootstrap', async () => {
    const root = createProjectRoot()
    const config: WhaleConfig = {
      app: {
        name: 'Scoped App',
        version: '0.1.0',
        identifier: 'com.acme.test',
      },
      windows: {
        main: {
          entry: './src/ui/windows/main.tsx',
        },
      },
    }

    vi.doMock('../package-meta.js', () => ({
      readCliPackageMeta: () => ({
        cliPackageName: '@acme/cli',
        sdkPackageName: '@acme/sdk',
        uiPackageName: '@acme/ui',
        version: '1.2.3',
      }),
    }))

    const { generateHtmlEntries } = await import('./html-entry.js')
    generateHtmlEntries(config, root, 'development')

    const bootstrap = readFileSync(join(root, '.whale', '__whale_entry___devtools__.ts'), 'utf-8')
    expect(bootstrap).toContain("import DevTools from \"@acme/sdk/devtools\"")
  })
})
