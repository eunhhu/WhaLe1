import pc from 'picocolors'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { loadAndValidateConfig, writeGeneratedTauriConf } from './shared.js'

export async function build(configPath: string): Promise<void> {
  console.log(pc.cyan('[whale]'), 'Running production checks...')
  try {
    const { absPath, config } = await loadAndValidateConfig(configPath)
    const generatedPath = writeGeneratedTauriConf(config)
    console.log(pc.dim(`  Config: ${absPath}`))
    console.log(pc.dim(`  Generated: ${generatedPath}`))

    const tsconfigPath = resolve(process.cwd(), 'tsconfig.json')
    if (existsSync(tsconfigPath)) {
      const result = spawnSync('bun', ['x', 'tsc', '-p', tsconfigPath, '--noEmit'], {
        stdio: 'inherit',
      })
      if (result.status !== 0) {
        process.exit(result.status ?? 1)
      }
    }

    console.log(pc.green('[whale]'), 'Build checks completed.')
  } catch (error) {
    console.error(pc.red('[whale]'), 'Build failed')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
