import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { WhaleConfig } from '../config.js'
import { generateTauriConf } from '../generators/tauri-conf.js'

export interface LoadedConfig {
  absPath: string
  config: WhaleConfig
}

export async function loadAndValidateConfig(configPath: string): Promise<LoadedConfig> {
  const absPath = resolve(process.cwd(), configPath)
  if (!existsSync(absPath)) {
    throw new Error(`Config file not found: ${absPath}`)
  }

  const mod = await import(`${pathToFileURL(absPath).href}?t=${Date.now()}`)
  const config = (mod.default ?? mod) as WhaleConfig
  validateConfig(config)

  return { absPath, config }
}

export function writeGeneratedTauriConf(config: WhaleConfig): string {
  const generated = generateTauriConf(config)
  const outDir = resolve(process.cwd(), '.whale')
  const outPath = resolve(outDir, 'tauri.conf.generated.json')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(generated, null, 2)}\n`, 'utf-8')
  return outPath
}

function validateConfig(config: WhaleConfig): void {
  const errors: string[] = []

  if (!config || typeof config !== 'object') {
    errors.push('Invalid config export: expected an object')
  }
  if (!config?.app?.name || !config?.app?.version || !config?.app?.identifier) {
    errors.push('app.name, app.version, app.identifier are required')
  }
  if (!config?.windows || Object.keys(config.windows).length === 0) {
    errors.push('windows must contain at least one window definition')
  } else {
    for (const [id, win] of Object.entries(config.windows)) {
      if (!win.entry) {
        errors.push(`windows.${id}.entry is required`)
        continue
      }
      const entryPath = resolve(process.cwd(), win.entry)
      if (!existsSync(entryPath)) {
        errors.push(`windows.${id}.entry not found: ${entryPath}`)
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.map((e) => `- ${e}`).join('\n'))
  }
}
