import type { WhaleConfig } from '../config.js'

export interface TauriConf {
  productName: string
  version: string
  identifier: string
  build: {
    frontendDist: string
    devUrl: string
    beforeDevCommand: string
    beforeBuildCommand: string
  }
  app: {
    windows: TauriWindowConf[]
  }
}

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

function mapWindowPosition(
  position?: { x: number; y: number } | string,
): { x?: number; y?: number } {
  if (!position) return {}
  if (typeof position === 'string') {
    // Named positions like 'center' are handled by Tauri defaults
    return {}
  }
  return { x: position.x, y: position.y }
}

function toTauriWindow(label: string, config: WhaleConfig['windows'][string]): TauriWindowConf {
  const pos = mapWindowPosition(config.position)
  return {
    label,
    url: config.entry,
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

export function generateTauriConf(config: WhaleConfig): TauriConf {
  const windows = Object.entries(config.windows).map(([label, wc]) =>
    toTauriWindow(label, wc),
  )

  return {
    productName: config.app.name,
    version: config.app.version,
    identifier: config.app.identifier,
    build: {
      frontendDist: config.build?.outDir ?? '../dist',
      devUrl: 'http://localhost:1420',
      beforeDevCommand: '',
      beforeBuildCommand: '',
    },
    app: {
      windows,
    },
  }
}
