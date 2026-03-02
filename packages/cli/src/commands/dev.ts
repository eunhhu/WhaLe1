import { spawn, spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import pc from 'picocolors'
import { loadConfig } from '../config-loader.js'
import { generateHtmlEntries } from '../generators/html-entry.js'
import { generateViteConfig } from '../generators/vite-config.js'
import { generateTauriConf, resolveBundleIcon } from '../generators/tauri-conf.js'
import type { WhaleConfig } from '../config.js'
import { resolveRuntimeOptions, type RuntimeOptions } from '../runtime-options.js'

const NPX_BIN = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const CARGO_BIN = process.platform === 'win32' ? 'cargo.exe' : 'cargo'

function hasRustToolchain(): boolean {
  const result = spawnSync(CARGO_BIN, ['--version'], { stdio: 'ignore' })
  return result.status === 0 && !result.error
}

function ensureTauriProject(
  projectRoot: string,
  config: WhaleConfig,
  runtime: RuntimeOptions,
): void {
  const srcTauri = join(projectRoot, 'src-tauri')
  if (existsSync(join(srcTauri, 'tauri.conf.json')) ||
      existsSync(join(srcTauri, 'tauri.conf.json5')) ||
      existsSync(join(srcTauri, 'Tauri.toml'))) {
    return
  }

  console.log(pc.cyan('[whale]'), 'Initializing Tauri project...')
  const result = spawnSync(NPX_BIN, [
    'tauri', 'init',
    '--ci',
    '--app-name', config.app.name,
    '--window-title', config.app.name,
    '--dev-url', runtime.devUrl,
    '--frontend-dist', runtime.frontendDistFromSrcTauri,
    '--before-dev-command', runtime.beforeDevCommand,
    '--before-build-command', runtime.beforeBuildCommand,
  ], {
    cwd: projectRoot,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    throw new Error('Failed to initialize Tauri project')
  }
  console.log(pc.green('[whale]'), 'Tauri project initialized')
}

function syncTauriIcons(projectRoot: string, config: WhaleConfig): void {
  const srcTauri = join(projectRoot, 'src-tauri')
  const bundleIcon = resolveBundleIcon(config, projectRoot)
  if (!bundleIcon) return

  const iconSourceAbsPath = resolve(srcTauri, bundleIcon)
  if (!existsSync(iconSourceAbsPath)) return

  console.log(pc.dim('  Syncing Tauri icons from source icon...'))
  const result = spawnSync(
    NPX_BIN,
    ['tauri', 'icon', iconSourceAbsPath, '--output', join(srcTauri, 'icons')],
    {
      cwd: projectRoot,
      stdio: 'inherit',
    },
  )

  if (result.status !== 0) {
    throw new Error(`Failed to generate Tauri icons from: ${iconSourceAbsPath}`)
  }
}

function validateFridaScripts(projectRoot: string, config: WhaleConfig): void {
  const scripts = config.frida?.scripts ?? []
  for (const [index, script] of scripts.entries()) {
    const absPath = resolve(projectRoot, script.entry)
    if (!existsSync(absPath)) {
      throw new Error(`frida.scripts[${index}].entry not found: ${absPath}`)
    }
  }
  if (scripts.length > 0) {
    console.log(pc.dim(`  Frida scripts configured: ${scripts.length}`))
  }
}

export async function dev(configPath: string): Promise<void> {
  const projectRoot = resolve(process.cwd())
  const skipTauri = process.env.WHALE_SKIP_TAURI === '1'
  const canRunTauri = !skipTauri && hasRustToolchain()
  console.log(pc.cyan('[whale]'), 'Starting development server...')

  try {
    // 1. Load whale.config.ts
    console.log(pc.dim('  Loading config...'))
    const config = await loadConfig(resolve(projectRoot, configPath))
    const runtime = resolveRuntimeOptions(config, projectRoot)
    console.log(pc.green('  Config loaded:'), config.app.name)
    validateFridaScripts(projectRoot, config)

    // 2. Generate HTML entries in configured outDir
    console.log(pc.dim('  Generating HTML entries...'))
    const htmlEntries = generateHtmlEntries(config, projectRoot, 'development', runtime.outDirAbs)
    for (const [label] of htmlEntries) {
      console.log(pc.dim(`    ${label}.html`))
    }

    // 3. Generate tauri.conf.json
    console.log(pc.dim('  Generating tauri.conf.json...'))
    const tauriConf = generateTauriConf(config, 'development', projectRoot)
    const tauriConfPath = runtime.tauriConfPathAbs
    writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2))

    // 4. Start Vite dev server programmatically
    console.log(pc.dim('  Starting Vite dev server...'))
    const viteConfig = generateViteConfig({
      config,
      projectRoot,
      htmlEntries,
      mode: 'development',
    })

    const { createServer } = await import('vite')
    const solidPlugin = (await import('vite-plugin-solid')).default
    viteConfig.plugins = [solidPlugin()]

    const viteServer = await createServer(viteConfig)
    await viteServer.listen()
    const viteAddress = viteServer.resolvedUrls?.local?.[0] ?? runtime.devUrl
    console.log(pc.green('  Vite dev server:'), viteAddress)

    if (!canRunTauri) {
      if (skipTauri) {
        console.log(pc.yellow('[whale]'), 'WHALE_SKIP_TAURI=1, running frontend-only dev server')
      } else {
        console.log(pc.yellow('[whale]'), 'Rust toolchain not found (cargo missing), running frontend-only dev server')
        console.log(pc.dim('  Install Rust from https://rustup.rs to enable Tauri runtime'))
      }
      return
    }

    // 5. Ensure src-tauri exists (auto-init if missing)
    ensureTauriProject(projectRoot, config, runtime)

    // 6. Keep platform icons aligned with app.icon/assets icon source.
    syncTauriIcons(projectRoot, config)

    // 7. Start tauri dev
    console.log(pc.cyan('[whale]'), 'Starting Tauri...')
    const tauriProcess = spawn(
      NPX_BIN,
      ['tauri', 'dev', '--config', tauriConfPath],
      {
        cwd: projectRoot,
        stdio: 'inherit',
      },
    )

    // Handle cleanup
    const cleanup = () => {
      viteServer.close()
      tauriProcess.kill()
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)

    tauriProcess.on('close', (code) => {
      viteServer.close()
      process.exit(code ?? 0)
    })
  } catch (error) {
    console.error(pc.red('[whale]'), 'Dev command failed')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
