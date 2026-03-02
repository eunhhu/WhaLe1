import { resolve } from 'node:path'
import type { WhaleConfig } from '../config.js'

export interface ViteConfigOptions {
  config: WhaleConfig
  projectRoot: string
  htmlEntries: Map<string, string>
  mode: 'development' | 'production'
}

export function generateViteConfig(options: ViteConfigOptions): Record<string, any> {
  const { config, projectRoot, htmlEntries, mode } = options

  const input: Record<string, string> = {}
  for (const [label, htmlPath] of htmlEntries) {
    input[label] = resolve(htmlPath)
  }

  return {
    root: resolve(projectRoot, '.whale'),
    mode,
    plugins: [],  // solid plugin added at runtime via import
    server: {
      port: 1420,
      strictPort: true,
    },
    build: {
      outDir: resolve(projectRoot, '.whale', 'dist'),
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
