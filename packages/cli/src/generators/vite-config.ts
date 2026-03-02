import { resolve } from 'node:path'
import type { WhaleConfig } from '../config.js'
import type { InlineConfig } from 'vite'
import { resolveRuntimeOptions } from '../runtime-options.js'

export interface ViteConfigOptions {
  config: WhaleConfig
  projectRoot: string
  htmlEntries: Map<string, string>
  mode: 'development' | 'production'
}

export function generateViteConfig(options: ViteConfigOptions): InlineConfig {
  const { config, projectRoot, htmlEntries, mode } = options
  const runtime = resolveRuntimeOptions(config, projectRoot)

  const input: Record<string, string> = {}
  for (const [label, htmlPath] of htmlEntries) {
    input[label] = resolve(htmlPath)
  }

  return {
    root: runtime.outDirAbs,
    mode,
    plugins: [],  // solid plugin added at runtime via import
    server: {
      host: runtime.devHost,
      port: runtime.devPort,
      strictPort: true,
      hmr: {
        host: runtime.devHost,
        clientPort: runtime.devPort,
      },
    },
    build: {
      outDir: runtime.distDirAbs,
      emptyOutDir: true,
      rollupOptions: {
        input,
      },
    },
    resolve: {
      alias: {
        '@': resolve(projectRoot, 'src'),
      },
    },
  }
}
