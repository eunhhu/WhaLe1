import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import pc from 'picocolors'
import { loadConfig } from '../config-loader.js'
import { generateHtmlEntries } from '../generators/html-entry.js'
import { generateViteConfig } from '../generators/vite-config.js'
import { generateTauriConf } from '../generators/tauri-conf.js'

export async function dev(configPath: string): Promise<void> {
  const projectRoot = resolve(process.cwd())
  console.log(pc.cyan('[whale]'), 'Starting development server...')

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

  // 3. Generate tauri.conf.json
  console.log(pc.dim('  Generating tauri.conf.json...'))
  const tauriConf = generateTauriConf(config, 'development')
  const tauriConfPath = join(projectRoot, '.whale', 'tauri.conf.json')
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
  const viteAddress = viteServer.resolvedUrls?.local?.[0] ?? 'http://localhost:1420'
  console.log(pc.green('  Vite dev server:'), viteAddress)

  // 5. Start tauri dev
  console.log(pc.cyan('[whale]'), 'Starting Tauri...')
  const tauriProcess = spawn(
    'npx',
    ['tauri', 'dev', '--config', tauriConfPath],
    {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: true,
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
}
