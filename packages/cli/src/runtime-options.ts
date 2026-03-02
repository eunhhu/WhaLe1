import { join, relative, resolve } from 'node:path'
import type { WhaleConfig } from './config.js'

export const DEFAULT_OUT_DIR = '.whale'
export const DEFAULT_DEV_HOST = '127.0.0.1'
export const DEFAULT_DEV_PORT = 1420

function toPosixPath(path: string): string {
  return path.replace(/\\/g, '/')
}

function parsePort(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return undefined
  }
  return parsed
}

function normalizeOutDir(projectRoot: string, configuredOutDir?: string): string {
  if (!configuredOutDir) return resolve(projectRoot, DEFAULT_OUT_DIR)
  return resolve(projectRoot, configuredOutDir)
}

function deriveHostPortFromDevUrl(devUrl: string): { host: string; port: number } | undefined {
  try {
    const parsed = new URL(devUrl)
    const host = parsed.hostname || DEFAULT_DEV_HOST
    const port =
      parsed.port.length > 0
        ? Number.parseInt(parsed.port, 10)
        : parsed.protocol === 'https:'
          ? 443
          : 80
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return undefined
    return { host, port }
  } catch {
    return undefined
  }
}

export interface RuntimeOptions {
  outDirAbs: string
  outDirFromProjectRoot: string
  distDirAbs: string
  tauriConfPathAbs: string
  generatedTauriConfPathAbs: string
  devHost: string
  devPort: number
  devUrl: string
  frontendDistFromSrcTauri: string
  beforeDevCommand: string
  beforeBuildCommand: string
}

export function resolveRuntimeOptions(config: WhaleConfig, projectRoot: string): RuntimeOptions {
  const outDirAbs = normalizeOutDir(projectRoot, config.build?.outDir)
  const outDirFromProjectRoot = toPosixPath(relative(projectRoot, outDirAbs)) || DEFAULT_OUT_DIR
  const distDirAbs = join(outDirAbs, 'dist')

  const envDevHost = process.env.WHALE_DEV_HOST ?? process.env.TAURI_DEV_HOST
  const envDevPort = parsePort(process.env.WHALE_DEV_PORT)
  const configuredDevUrl = config.build?.devUrl
  const parsedFromDevUrl = configuredDevUrl ? deriveHostPortFromDevUrl(configuredDevUrl) : undefined

  const devHost = config.build?.devHost ?? parsedFromDevUrl?.host ?? envDevHost ?? DEFAULT_DEV_HOST
  const devPort = config.build?.devPort ?? parsedFromDevUrl?.port ?? envDevPort ?? DEFAULT_DEV_PORT
  const devUrl = configuredDevUrl ?? `http://${devHost}:${devPort}`

  const srcTauriRoot = join(projectRoot, 'src-tauri')
  const frontendDistFromSrcTauri = toPosixPath(relative(srcTauriRoot, distDirAbs))

  return {
    outDirAbs,
    outDirFromProjectRoot,
    distDirAbs,
    tauriConfPathAbs: join(outDirAbs, 'tauri.conf.json'),
    generatedTauriConfPathAbs: join(outDirAbs, 'tauri.conf.generated.json'),
    devHost,
    devPort,
    devUrl,
    frontendDistFromSrcTauri,
    beforeDevCommand: config.build?.beforeDevCommand ?? '',
    beforeBuildCommand: config.build?.beforeBuildCommand ?? '',
  }
}
