import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import pc from 'picocolors'

function writeFile(path: string, content: string): void {
  writeFileSync(path, content, 'utf-8')
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

function scaffoldPackageJson(name: string): string {
  return JSON.stringify(
    {
      name,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'whale dev',
        build: 'whale build',
      },
      dependencies: {
        '@whale/sdk': '^0.1.0',
        '@whale/ui': '^0.1.0',
        'solid-js': '^1.9.0',
      },
      devDependencies: {
        '@whale/cli': '^0.1.0',
        typescript: '^5.7.0',
      },
    },
    null,
    2,
  )
}

function scaffoldTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        jsx: 'preserve',
        jsxImportSource: 'solid-js',
        outDir: 'dist',
        rootDir: 'src',
        declaration: true,
        sourceMap: true,
      },
      include: ['src'],
    },
    null,
    2,
  )
}

function scaffoldWhaleConfig(): string {
  return `import { defineConfig } from '@whale/cli/config'

export default defineConfig({
  app: {
    name: 'My WhaLe App',
    version: '0.1.0',
    identifier: 'com.whale.app',
  },
  windows: {
    main: {
      entry: './src/ui/windows/main.tsx',
      width: 800,
      height: 600,
      resizable: true,
      decorations: true,
      visible: true,
    },
    overlay: {
      entry: './src/ui/windows/overlay.tsx',
      width: 400,
      height: 300,
      transparent: true,
      decorations: false,
      alwaysOnTop: true,
      clickThrough: true,
    },
    settings: {
      entry: './src/ui/windows/settings.tsx',
      width: 600,
      height: 500,
      resizable: false,
      decorations: true,
      visible: false,
    },
  },
  store: {
    persist: true,
  },
})
`
}

function scaffoldMainWindow(): string {
  return `import { render } from 'solid-js/web'

function Main() {
  return (
    <div>
      <h1>WhaLe App</h1>
      <p>Main window</p>
    </div>
  )
}

render(() => <Main />, document.getElementById('root')!)
`
}

function scaffoldOverlayWindow(): string {
  return `import { render } from 'solid-js/web'

function Overlay() {
  return (
    <div>
      <p>Overlay</p>
    </div>
  )
}

render(() => <Overlay />, document.getElementById('root')!)
`
}

function scaffoldSettingsWindow(): string {
  return `import { render } from 'solid-js/web'

function Settings() {
  return (
    <div>
      <h1>Settings</h1>
    </div>
  )
}

render(() => <Settings />, document.getElementById('root')!)
`
}

function scaffoldStore(): string {
  return `import { createSyncStore } from '@whale/sdk'

export interface TrainerState {
  running: boolean
  currentStep: number
}

export const trainerStore = createSyncStore('trainer', {
  running: false,
  currentStep: 0,
})
`
}

function scaffoldHooksMain(): string {
  return `// Main script hooks — runs in Tauri backend context
// Use this for game memory reading, automation, etc.

export function onInit(): void {
  console.log('[hooks] initialized')
}

export function onTick(): void {
  // Called on each tick
}

export function onDestroy(): void {
  console.log('[hooks] destroyed')
}
`
}

function scaffoldTypes(): string {
  return `// Shared types for scripts

export interface GameState {
  // Define your game state here
}

export interface ScriptConfig {
  // Define your script configuration here
}
`
}

export async function create(name: string): Promise<void> {
  const root = join(process.cwd(), name)

  if (existsSync(root)) {
    console.log(pc.red(`[whale] Directory "${name}" already exists.`))
    process.exit(1)
  }

  console.log(pc.cyan('[whale]'), `Creating project "${name}"...`)

  // Create directory structure
  ensureDir(join(root, 'src', 'ui', 'windows'))
  ensureDir(join(root, 'src', 'store'))
  ensureDir(join(root, 'src', 'script', 'hooks'))

  // Write files
  writeFile(join(root, 'package.json'), scaffoldPackageJson(name))
  writeFile(join(root, 'tsconfig.json'), scaffoldTsConfig())
  writeFile(join(root, 'whale.config.ts'), scaffoldWhaleConfig())
  writeFile(join(root, 'src', 'ui', 'windows', 'main.tsx'), scaffoldMainWindow())
  writeFile(join(root, 'src', 'ui', 'windows', 'overlay.tsx'), scaffoldOverlayWindow())
  writeFile(join(root, 'src', 'ui', 'windows', 'settings.tsx'), scaffoldSettingsWindow())
  writeFile(join(root, 'src', 'store', 'trainer.ts'), scaffoldStore())
  writeFile(join(root, 'src', 'script', 'hooks', 'main.ts'), scaffoldHooksMain())
  writeFile(join(root, 'src', 'script', 'types.ts'), scaffoldTypes())

  console.log(pc.green('[whale]'), 'Project created successfully!')
  console.log()
  console.log('  Next steps:')
  console.log(pc.dim(`  cd ${name}`))
  console.log(pc.dim('  bun install'))
  console.log(pc.dim('  bun run dev'))
}
