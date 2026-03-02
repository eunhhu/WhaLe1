import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import type { WhaleConfig } from '../config.js'
import { resolveRuntimeOptions } from '../runtime-options.js'

export interface TauriWindowConf {
  label: string
  url: string
  width?: number
  height?: number
  resizable?: boolean
  alwaysOnTop?: boolean
  transparent?: boolean
  decorations?: boolean
  skipTaskbar?: boolean
  visible?: boolean
  x?: number
  y?: number
}

export interface TauriConf {
  productName: string
  version: string
  identifier: string
  build: {
    frontendDist?: string
    devUrl?: string
    beforeDevCommand: string
    beforeBuildCommand: string
  }
  app: {
    withGlobalTauri: boolean
    windows: TauriWindowConf[]
  }
  bundle: {
    active: boolean
    icon: string[]
  }
}

export type TauriConfMode = 'development' | 'production'
const DEFAULT_BUNDLE_ICONS = [
  'icons/32x32.png',
  'icons/128x128.png',
  'icons/128x128@2x.png',
  'icons/icon.icns',
  'icons/icon.ico',
]

function toPosixPath(path: string): string {
  return path.replace(/\\/g, '/')
}

function resolveBundleIcon(config: WhaleConfig, projectRoot: string): string | undefined {
  const srcTauriRoot = join(projectRoot, 'src-tauri')
  const configuredIcon = config.app.icon
  if (configuredIcon) {
    const configuredAbsPath = resolve(projectRoot, configuredIcon)
    if (existsSync(configuredAbsPath)) {
      return toPosixPath(relative(srcTauriRoot, configuredAbsPath))
    }
  }

  // Prefer assets/icon.png from current project or any parent workspace.
  let cursor = projectRoot
  while (true) {
    const candidate = join(cursor, 'assets', 'icon.png')
    if (existsSync(candidate)) {
      return toPosixPath(relative(srcTauriRoot, candidate))
    }
    const parent = dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }

  return undefined
}

function mapWindowPosition(
  position?: { x: number; y: number } | string,
): { x?: number; y?: number } {
  if (!position) return {}
  if (typeof position === 'string') {
    return {}
  }
  return { x: position.x, y: position.y }
}

function toTauriWindow(
  label: string,
  config: WhaleConfig['windows'][string],
): TauriWindowConf {
  const pos = mapWindowPosition(config.position)

  return {
    label,
    url: `${label}.html`,
    ...(config.width !== undefined && { width: config.width }),
    ...(config.height !== undefined && { height: config.height }),
    ...(config.resizable !== undefined && { resizable: config.resizable }),
    ...(config.alwaysOnTop !== undefined && { alwaysOnTop: config.alwaysOnTop }),
    ...(config.transparent !== undefined && { transparent: config.transparent }),
    ...(config.decorations !== undefined && { decorations: config.decorations }),
    ...(config.skipTaskbar !== undefined && { skipTaskbar: config.skipTaskbar }),
    ...(config.visible !== undefined && { visible: config.visible }),
    ...(pos.x !== undefined && { x: pos.x }),
    ...(pos.y !== undefined && { y: pos.y }),
  }
}

export function generateTauriConf(
  config: WhaleConfig,
  mode: TauriConfMode = 'development',
  projectRoot: string = process.cwd(),
): TauriConf {
  const runtime = resolveRuntimeOptions(config, projectRoot)
  const windows = Object.entries(config.windows).map(([label, wc]) =>
    toTauriWindow(label, wc),
  )
  const bundleIcon = resolveBundleIcon(config, projectRoot)

  const buildConf: TauriConf['build'] =
    mode === 'development'
      ? {
          devUrl: runtime.devUrl,
          beforeDevCommand: runtime.beforeDevCommand,
          beforeBuildCommand: runtime.beforeBuildCommand,
        }
      : {
          frontendDist: runtime.frontendDistFromSrcTauri,
          beforeDevCommand: runtime.beforeDevCommand,
          beforeBuildCommand: runtime.beforeBuildCommand,
        }

  return {
    productName: config.app.name,
    version: config.app.version,
    identifier: config.app.identifier,
    build: buildConf,
    app: {
      withGlobalTauri: true,
      windows,
    },
    bundle: {
      active: mode === 'production',
      icon: bundleIcon ? [bundleIcon, ...DEFAULT_BUNDLE_ICONS] : DEFAULT_BUNDLE_ICONS,
    },
  }
}
