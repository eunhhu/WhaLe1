import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import pc from 'picocolors'
import { loadConfig } from '../config-loader.js'
import { generateTauriConf } from '../generators/tauri-conf.js'

export async function generateConfig(
  configPath: string,
  outPath = '.whale/tauri.conf.generated.json',
): Promise<void> {
  const projectRoot = resolve(process.cwd())
  const absoluteConfigPath = resolve(projectRoot, configPath)
  const absoluteOutPath = resolve(projectRoot, outPath)

  console.log(pc.cyan('[whale]'), 'Generating config...')
  const config = await loadConfig(absoluteConfigPath)
  const tauriConf = generateTauriConf(config, 'development')

  mkdirSync(dirname(absoluteOutPath), { recursive: true })
  writeFileSync(absoluteOutPath, `${JSON.stringify(tauriConf, null, 2)}\n`, 'utf-8')
  console.log(pc.green('[whale]'), `Config generated: ${absoluteOutPath}`)
}
