import type { WhaleConfig } from '../config.js'

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
  mode: TauriConfMode,
): TauriWindowConf {
  const pos = mapWindowPosition(config.position)

  // In dev mode, each window points to the Vite dev server URL
  // In production, each window points to the built HTML file
  const url =
    mode === 'development'
      ? `${label}.html`
      : `${label}.html`

  return {
    label,
    url,
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
): TauriConf {
  const windows = Object.entries(config.windows).map(([label, wc]) =>
    toTauriWindow(label, wc, mode),
  )

  const buildConf: TauriConf['build'] =
    mode === 'development'
      ? {
          devUrl: 'http://localhost:1420',
          beforeDevCommand: '',
          beforeBuildCommand: '',
        }
      : {
          frontendDist: '.whale/dist',
          beforeDevCommand: '',
          beforeBuildCommand: '',
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
      icon: [
        'icons/32x32.png',
        'icons/128x128.png',
        'icons/128x128@2x.png',
        'icons/icon.icns',
        'icons/icon.ico',
      ],
    },
  }
}
