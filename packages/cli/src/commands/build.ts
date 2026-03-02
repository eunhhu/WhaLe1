import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import pc from 'picocolors'
import { loadConfig } from '../config-loader.js'
import { generateHtmlEntries } from '../generators/html-entry.js'
import { generateViteConfig } from '../generators/vite-config.js'
import { generateTauriConf } from '../generators/tauri-conf.js'

export async function build(configPath: string): Promise<void> {
  const projectRoot = resolve(process.cwd())
  console.log(pc.cyan('[whale]'), 'Building for production...')

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

  // 5. Run tauri build
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
}
