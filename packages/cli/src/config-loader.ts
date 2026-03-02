import { build } from 'esbuild'
import { writeFileSync, unlinkSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WhaleConfig } from './config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function loadConfig(configPath: string): Promise<WhaleConfig> {
  const absolutePath = resolve(configPath)
  const tempFile = absolutePath + '.timestamp-' + Date.now() + '.mjs'

  // Resolve @whale/cli to the actual config.ts source
  const cliConfigPath = resolve(__dirname, '..', 'src', 'config.ts')
  // Also try the dist version
  const cliConfigDistPath = resolve(__dirname, 'config.js')

  const result = await build({
    entryPoints: [absolutePath],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    external: ['solid-js', 'solid-js/*'],
    alias: {
      '@whale/cli': cliConfigDistPath,
      '@whale/cli/config': cliConfigDistPath,
    },
  })

  const code = result.outputFiles[0].text
  writeFileSync(tempFile, code)

  try {
    const mod = await import(tempFile)
    return mod.default as WhaleConfig
  } finally {
    unlinkSync(tempFile)
  }
}
