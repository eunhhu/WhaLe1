import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generateHtmlEntries } from './html-entry.js'
import type { WhaleConfig } from '../config.js'

const tempRoots: string[] = []

function createProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'whale-html-entry-'))
  tempRoots.push(root)
  mkdirSync(join(root, 'src', 'ui', 'windows'), { recursive: true })
  writeFileSync(join(root, 'src', 'ui', 'windows', 'main.tsx'), 'export default function Main() { return null }')
  return root
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('generateHtmlEntries', () => {
  const config: WhaleConfig = {
    app: {
      name: 'Test App',
      version: '0.1.0',
      identifier: 'com.whale.test',
    },
    windows: {
      main: {
        entry: './src/ui/windows/main.tsx',
      },
    },
  }

  it('generates bootstrap entries for development with HMR', () => {
    const root = createProjectRoot()
    generateHtmlEntries(config, root, 'development')

    const html = readFileSync(join(root, '.whale', 'main.html'), 'utf-8')
    const bootstrap = readFileSync(join(root, '.whale', '__whale_entry_main.ts'), 'utf-8')
    const expectedEntry = `/@fs/${resolve(root, 'src', 'ui', 'windows', 'main.tsx').replace(/\\/g, '/')}`

    expect(html).toContain('<script type="module" src="./__whale_entry_main.ts"></script>')
    expect(bootstrap).toContain(`import * as WindowModule from ${JSON.stringify(expectedEntry)}`)
    expect(bootstrap).toContain('import.meta.hot.accept')
  })

  it('generates bootstrap entries for production build', () => {
    const root = createProjectRoot()
    generateHtmlEntries(config, root, 'production')

    const bootstrap = readFileSync(join(root, '.whale', '__whale_entry_main.ts'), 'utf-8')
    expect(bootstrap).toContain('import * as WindowModule from "../src/ui/windows/main.tsx"')
  })

  it('supports custom output directory without hardcoded .whale paths', () => {
    const root = createProjectRoot()
    const outDir = join(root, '.generated', 'whale')
    generateHtmlEntries(config, root, 'production', outDir)

    const html = readFileSync(join(outDir, 'main.html'), 'utf-8')
    const bootstrap = readFileSync(join(outDir, '__whale_entry_main.ts'), 'utf-8')

    expect(html).toContain('<script type="module" src="./__whale_entry_main.ts"></script>')
    expect(bootstrap).toContain('import * as WindowModule from "../../src/ui/windows/main.tsx"')
  })
})
