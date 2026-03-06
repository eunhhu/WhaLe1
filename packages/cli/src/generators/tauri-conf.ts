import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import type { WhaleConfig } from '../config.js'
import { resolveRuntimeOptions } from '../runtime-options.js'

export interface TauriWindowConf {
  label: string
  url: string
  title?: string
  width?: number
  height?: number
  resizable?: boolean
  alwaysOnTop?: boolean
  transparent?: boolean
  decorations?: boolean
  shadow?: boolean
  backgroundColor?: string
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
    macOSPrivateApi?: boolean
    withGlobalTauri: boolean
    windows: TauriWindowConf[]
  }
  bundle: {
    active: boolean
    icon: string[]
    resources?: Record<string, string>
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

export function resolveBundleIcon(config: WhaleConfig, projectRoot: string): string | undefined {
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

function resolveBundleResources(
  config: WhaleConfig,
  projectRoot: string,
): Record<string, string> | undefined {
  const scripts = config.frida?.scripts ?? []
  if (scripts.length === 0) return undefined

  const resources = Object.fromEntries(
    scripts
      .map((script) => {
        const absolutePath = resolve(projectRoot, script.entry)
        if (!existsSync(absolutePath)) return undefined
        const relativePath = toPosixPath(relative(projectRoot, absolutePath))
        return [absolutePath, relativePath]
      })
      .filter((entry): entry is [string, string] => Array.isArray(entry)),
  )

  return Object.keys(resources).length > 0 ? resources : undefined
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
  appName: string,
  config: WhaleConfig['windows'][string],
): TauriWindowConf {
  const pos = mapWindowPosition(config.position)
  const title = config.title ?? appName

  return {
    label,
    url: `${label}.html`,
    title,
    ...(config.width !== undefined && { width: config.width }),
    ...(config.height !== undefined && { height: config.height }),
    ...(config.resizable !== undefined && { resizable: config.resizable }),
    ...(config.alwaysOnTop !== undefined && { alwaysOnTop: config.alwaysOnTop }),
    ...(config.transparent !== undefined && { transparent: config.transparent }),
    ...(config.decorations !== undefined && { decorations: config.decorations }),
    ...(config.shadow !== undefined ? { shadow: config.shadow } : config.transparent ? { shadow: false } : {}),
    backgroundColor: config.transparent ? '#00000000' : '#0f0f17',
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
    toTauriWindow(label, config.app.name, wc),
  )
  const hasTransparentWindow = windows.some((window) => window.transparent === true)

  // Auto-inject devtools window in development mode
  if (mode === 'development') {
    windows.push({
      label: '__devtools__',
      url: '__devtools__.html',
      title: `${config.app.name} - DevTools`,
      width: 900,
      height: 600,
      resizable: true,
      decorations: true,
      backgroundColor: '#0f0f17',
      visible: false,
    })
  }

  const bundleIcon = resolveBundleIcon(config, projectRoot)
  const bundleResources = resolveBundleResources(config, projectRoot)

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
      ...(hasTransparentWindow ? { macOSPrivateApi: true } : {}),
      withGlobalTauri: false,
      windows,
    },
    bundle: {
      active: mode === 'production',
      icon: bundleIcon ? [bundleIcon, ...DEFAULT_BUNDLE_ICONS] : DEFAULT_BUNDLE_ICONS,
      ...(bundleResources ? { resources: bundleResources } : {}),
    },
  }
}
