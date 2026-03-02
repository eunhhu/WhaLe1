export interface WindowConfig {
  entry: string
  width?: number
  height?: number
  resizable?: boolean
  alwaysOnTop?: boolean
  transparent?: boolean
  decorations?: boolean
  skipTaskbar?: boolean
  visible?: boolean
  position?: { x: number; y: number } | string
  clickThrough?: boolean
}

export interface AppConfig {
  name: string
  version: string
  identifier: string
  icon?: string
}

export interface BuildConfig {
  outDir?: string
  devHost?: string
  devPort?: number
  devUrl?: string
  beforeDevCommand?: string
  beforeBuildCommand?: string
}

export interface WhaleConfig {
  app: AppConfig
  windows: Record<string, WindowConfig & { entry: string }>
  store?: { persist?: boolean; persistPath?: string }
  build?: BuildConfig
}

export function defineConfig(config: WhaleConfig): WhaleConfig {
  return config
}
