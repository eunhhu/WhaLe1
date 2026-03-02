import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import pc from 'picocolors'
import { loadConfig } from '../config-loader.js'
import { generateTauriConf } from '../generators/tauri-conf.js'
import { resolveRuntimeOptions } from '../runtime-options.js'

export async function generateConfig(
  configPath: string,
  outPath?: string,
): Promise<void> {
  const projectRoot = resolve(process.cwd())
  const absoluteConfigPath = resolve(projectRoot, configPath)

  console.log(pc.cyan('[whale]'), 'Generating config...')
  const config = await loadConfig(absoluteConfigPath)
  const runtime = resolveRuntimeOptions(config, projectRoot)
  const absoluteOutPath =
    outPath ? resolve(projectRoot, outPath) : runtime.generatedTauriConfPathAbs
  const tauriConf = generateTauriConf(config, 'development', projectRoot)

  mkdirSync(dirname(absoluteOutPath), { recursive: true })
  writeFileSync(absoluteOutPath, `${JSON.stringify(tauriConf, null, 2)}\n`, 'utf-8')
  console.log(pc.green('[whale]'), `Config generated: ${absoluteOutPath}`)
}
