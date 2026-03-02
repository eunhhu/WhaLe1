import pc from 'picocolors'
import { loadAndValidateConfig, writeGeneratedTauriConf } from './shared.js'

export async function dev(configPath: string): Promise<void> {
  console.log(pc.cyan('[whale]'), 'Preparing development runtime...')
  try {
    const { absPath, config } = await loadAndValidateConfig(configPath)
    const generatedPath = writeGeneratedTauriConf(config)
    console.log(pc.dim(`  Config: ${absPath}`))
    console.log(pc.dim(`  Windows: ${Object.keys(config.windows).length}`))
    console.log(pc.dim(`  Generated: ${generatedPath}`))
    console.log(pc.green('[whale]'), 'Config validation complete.')
  } catch (error) {
    console.error(pc.red('[whale]'), 'Failed to prepare development runtime')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
