import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { create } from './create.js'

const tempRoots: string[] = []

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempRoots.push(dir)
  return dir
}

function write(path: string, content: string): void {
  writeFileSync(path, content, 'utf-8')
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('create command', () => {
  it('creates a starter project scaffold from the default template', async () => {
    const base = createTempDir('whale-create-')
    const targetName = 'my-trainer-app'
    const targetRoot = join(base, targetName)

    const previousInitCwd = process.env.INIT_CWD
    process.env.INIT_CWD = base
    try {
      await create(targetName)
    } finally {
      if (previousInitCwd === undefined) {
        delete process.env.INIT_CWD
      } else {
        process.env.INIT_CWD = previousInitCwd
      }
    }

    expect(existsSync(join(targetRoot, 'whale.config.ts'))).toBe(true)
    expect(existsSync(join(targetRoot, 'src', 'ui', 'windows', 'main.tsx'))).toBe(true)
    expect(existsSync(join(targetRoot, 'src', 'store', 'app.ts'))).toBe(true)
    expect(existsSync(join(targetRoot, 'src', 'frida', 'session.ts'))).toBe(true)
    expect(existsSync(join(targetRoot, 'src', 'script', 'main.ts'))).toBe(true)
    expect(existsSync(join(targetRoot, 'src', 'script', 'tsconfig.json'))).toBe(true)
    expect(existsSync(join(targetRoot, 'src', 'script', 'globals.d.ts'))).toBe(true)
    expect(existsSync(join(targetRoot, 'assets', 'icon.png'))).toBe(true)

    const whaleConfig = readFileSync(join(targetRoot, 'whale.config.ts'), 'utf-8')
    const cliPackageJson = JSON.parse(readFileSync(join(process.cwd(), 'packages', 'cli', 'package.json'), 'utf-8')) as {
      version: string
    }
    const generatedPackageJson = JSON.parse(readFileSync(join(targetRoot, 'package.json'), 'utf-8')) as {
      scripts: Record<string, string>
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    const generatedTsConfig = JSON.parse(readFileSync(join(targetRoot, 'tsconfig.json'), 'utf-8')) as {
      extends?: string
      compilerOptions?: Record<string, unknown>
    }
    expect(whaleConfig).toContain("import { defineConfig } from '@whale1/cli'")
    expect(whaleConfig).toContain("icon: './assets/icon.png'")
    expect(whaleConfig).toContain("title: 'My Trainer App'")
    expect(whaleConfig).toContain('scripts: []')
    expect(generatedPackageJson.scripts.typecheck).toContain('src/script/tsconfig.json')
    expect(generatedPackageJson.dependencies['@whale1/sdk']).toBe(`^${cliPackageJson.version}`)
    expect(generatedPackageJson.dependencies['@whale1/ui']).toBe(`^${cliPackageJson.version}`)
    expect(generatedPackageJson.devDependencies['@whale1/cli']).toBe(`^${cliPackageJson.version}`)
    expect(generatedTsConfig.extends).toBeUndefined()
    expect(generatedTsConfig.compilerOptions?.moduleResolution).toBe('bundler')
  })

  it('uses INIT_CWD as the base path when provided', async () => {
    const invokedFrom = createTempDir('whale-create-invoked-')
    const runtimeCwd = createTempDir('whale-create-runtime-')
    const projectName = 'init-cwd-target'
    const expectedRoot = join(invokedFrom, projectName)
    const unexpectedRoot = join(runtimeCwd, projectName)

    const previousInitCwd = process.env.INIT_CWD
    const previousCwd = process.cwd()
    process.env.INIT_CWD = invokedFrom
    process.chdir(runtimeCwd)
    try {
      await create(projectName)
    } finally {
      process.chdir(previousCwd)
      if (previousInitCwd === undefined) {
        delete process.env.INIT_CWD
      } else {
        process.env.INIT_CWD = previousInitCwd
      }
    }

    expect(existsSync(join(expectedRoot, 'package.json'))).toBe(true)
    expect(existsSync(unexpectedRoot)).toBe(false)
  })

  it('supports custom template sources via WHALE_CREATE_TEMPLATE_DIR', async () => {
    const base = createTempDir('whale-create-template-')
    const templateDir = join(base, 'template')
    const targetName = 'custom-template-app'
    const targetRoot = join(base, targetName)

    ensureDir(join(templateDir, 'src', 'ui', 'windows'))
    ensureDir(join(templateDir, 'src', 'store'))
    ensureDir(join(templateDir, 'src', 'script'))

    write(
      join(templateDir, 'package.json'),
      JSON.stringify(
        {
          name: 'template-app',
          version: '0.0.1',
          private: true,
          type: 'module',
          scripts: {
            dev: 'bun run dev',
            build: 'bun run build',
          },
          dependencies: {
            '@whale1/sdk': 'workspace:*',
            '@whale1/ui': 'workspace:*',
            'solid-js': '^1.9.11',
          },
          devDependencies: {
            '@whale1/cli': 'workspace:*',
          },
        },
        null,
        2,
      ),
    )
    write(
      join(templateDir, 'whale.config.ts'),
      [
        "import { defineConfig } from '@whale1/cli'",
        '',
        'export default defineConfig({',
        '  app: {',
        "    name: 'Template App',",
        "    version: '0.0.1',",
        "    identifier: 'com.template.app',",
        "    icon: '../../assets/icon.png',",
        '  },',
        '  windows: {',
        '    main: {',
        "      entry: './src/ui/windows/main.tsx',",
        "      title: 'Template App',",
        '      width: 400,',
        '      height: 500,',
        '    },',
        '  },',
        '})',
        '',
      ].join('\n'),
    )
    write(join(templateDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { noEmit: true } }, null, 2))
    write(join(templateDir, 'src', 'ui', 'windows', 'main.tsx'), "export default function Main() { return <div>CUSTOM_TEMPLATE_MAIN</div> }\n")
    write(join(templateDir, 'src', 'ui', 'windows', 'overlay.tsx'), 'export default function Overlay() { return null }\n')
    write(join(templateDir, 'src', 'ui', 'windows', 'settings.tsx'), 'export default function Settings() { return null }\n')
    write(join(templateDir, 'src', 'store', 'trainer.ts'), 'export const trainer = {}\n')
    write(join(templateDir, 'src', 'script', 'main.ts'), 'console.log("hello")\n')

    const previousInitCwd = process.env.INIT_CWD
    const previousTemplateDir = process.env.WHALE_CREATE_TEMPLATE_DIR
    process.env.INIT_CWD = base
    process.env.WHALE_CREATE_TEMPLATE_DIR = templateDir
    try {
      await create(targetName)
    } finally {
      if (previousInitCwd === undefined) {
        delete process.env.INIT_CWD
      } else {
        process.env.INIT_CWD = previousInitCwd
      }
      if (previousTemplateDir === undefined) {
        delete process.env.WHALE_CREATE_TEMPLATE_DIR
      } else {
        process.env.WHALE_CREATE_TEMPLATE_DIR = previousTemplateDir
      }
    }

    const mainWindow = readFileSync(join(targetRoot, 'src', 'ui', 'windows', 'main.tsx'), 'utf-8')
    const generatedPackageJson = JSON.parse(readFileSync(join(targetRoot, 'package.json'), 'utf-8')) as {
      scripts: Record<string, string>
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    const whaleConfig = readFileSync(join(targetRoot, 'whale.config.ts'), 'utf-8')
    expect(mainWindow).toContain('CUSTOM_TEMPLATE_MAIN')
    expect(generatedPackageJson.scripts.dev).toBe('whale dev')
    expect(generatedPackageJson.scripts.build).toBe('whale build')
    expect(generatedPackageJson.dependencies['@whale1/sdk']).toMatch(/^\^/)
    expect(generatedPackageJson.dependencies['@whale1/ui']).toMatch(/^\^/)
    expect(generatedPackageJson.devDependencies['@whale1/cli']).toMatch(/^\^/)
    expect(whaleConfig).toContain("icon: './assets/icon.png'")
    expect(whaleConfig).toContain("name: 'Custom Template App'")
  })
})
