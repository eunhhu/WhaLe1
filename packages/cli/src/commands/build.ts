import { spawn, spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import pc from 'picocolors'
import { loadConfig } from '../config-loader.js'
import { generateHtmlEntries } from '../generators/html-entry.js'
import { generateViteConfig } from '../generators/vite-config.js'
import { generateTauriConf } from '../generators/tauri-conf.js'
import type { WhaleConfig } from '../config.js'

function ensureTauriProject(projectRoot: string, config: WhaleConfig): void {
  const srcTauri = join(projectRoot, 'src-tauri')
  if (existsSync(join(srcTauri, 'tauri.conf.json')) ||
      existsSync(join(srcTauri, 'tauri.conf.json5')) ||
      existsSync(join(srcTauri, 'Tauri.toml'))) {
    return
  }

  console.log(pc.cyan('[whale]'), 'Initializing Tauri project...')
  const result = spawnSync('npx', [
    'tauri', 'init',
    '--ci',
    '--app-name', config.app.name,
    '--window-title', config.app.name,
    '--dev-url', 'http://localhost:1420',
    '--frontend-dist', '../.whale/dist',
    '--before-dev-command', '',
    '--before-build-command', '',
  ], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  })

  if (result.status !== 0) {
    throw new Error('Failed to initialize Tauri project')
  }
  console.log(pc.green('[whale]'), 'Tauri project initialized')
}

export async function build(configPath: string): Promise<void> {
  const projectRoot = resolve(process.cwd())
  const skipTauri = process.env.WHALE_SKIP_TAURI === '1'
  console.log(pc.cyan('[whale]'), 'Building for production...')

  try {
    // 1. Load whale.config.ts
    console.log(pc.dim('  Loading config...'))
    const config = await loadConfig(resolve(projectRoot, configPath))
    console.log(pc.green('  Config loaded:'), config.app.name)

    // 2. Generate HTML entries in .whale/
    console.log(pc.dim('  Generating HTML entries...'))
    const htmlEntries = generateHtmlEntries(config, projectRoot)
    for (const [label] of htmlEntries) {
      console.log(pc.dim(`    ${label}.html`))
    }

    // 3. Vite production build
    console.log(pc.cyan('[whale]'), 'Building frontend...')
    const viteConfig = generateViteConfig({
      config,
      projectRoot,
      htmlEntries,
      mode: 'production',
    })

    const { build: viteBuild } = await import('vite')
    const solidPlugin = (await import('vite-plugin-solid')).default
    viteConfig.plugins = [solidPlugin()]

    await viteBuild(viteConfig)
    console.log(pc.green('  Frontend build complete'))

    // 4. Generate tauri.conf.json for production
    console.log(pc.dim('  Generating tauri.conf.json...'))
    const tauriConf = generateTauriConf(config, 'production')
    const tauriConfPath = join(projectRoot, '.whale', 'tauri.conf.json')
    writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2))

    if (skipTauri) {
      console.log(pc.yellow('[whale]'), 'WHALE_SKIP_TAURI=1, skipping Tauri build')
      console.log(pc.green('[whale]'), 'Build complete!')
      return
    }

    // 5. Ensure src-tauri exists (auto-init if missing)
    ensureTauriProject(projectRoot, config)

    // 6. Run tauri build
    console.log(pc.cyan('[whale]'), 'Building Tauri application...')
    const tauriProcess = spawn(
      'npx',
      ['tauri', 'build', '--config', tauriConfPath],
      {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: true,
      },
    )

    await new Promise<void>((resolve, reject) => {
      tauriProcess.on('close', (code) => {
        if (code === 0) {
          console.log(pc.green('[whale]'), 'Build complete!')
          resolve()
        } else {
          reject(new Error(`Tauri build failed with exit code ${code}`))
        }
      })
      tauriProcess.on('error', reject)
    })
  } catch (error) {
    console.error(pc.red('[whale]'), 'Build command failed')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
