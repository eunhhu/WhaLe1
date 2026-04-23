import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_PACKAGE_VERSION = '0.1.0'
const FALLBACK_SCOPE = '@whale1'

export interface CliPackageMeta {
  cliPackageName: string
  sdkPackageName: string
  uiPackageName: string
  version: string
}

export function deriveSiblingPackageName(cliPackageName: string, sibling: 'sdk' | 'ui'): string {
  if (cliPackageName.includes('/')) {
    const [scope] = cliPackageName.split('/')
    return `${scope}/${sibling}`
  }
  if (cliPackageName.endsWith('-cli')) {
    return `${cliPackageName.slice(0, -4)}-${sibling}`
  }
  return `${FALLBACK_SCOPE}/${sibling}`
}

export function findCliPackageRoot(fromUrl: string = import.meta.url): string {
  let dir = dirname(fileURLToPath(fromUrl))
  while (true) {
    const packageJsonPath = join(dir, 'package.json')
    if (existsSync(packageJsonPath)) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error('Unable to locate CLI package root.')
    }
    dir = parent
  }
}

export function readCliPackageMeta(fromUrl: string = import.meta.url): CliPackageMeta {
  try {
    const cliRoot = findCliPackageRoot(fromUrl)
    const packageJsonPath = join(cliRoot, 'package.json')
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
      name?: string
      version?: string
    }
    const cliPackageName = pkg.name ?? `${FALLBACK_SCOPE}/cli`
    const version = pkg.version ?? DEFAULT_PACKAGE_VERSION
    return {
      cliPackageName,
      sdkPackageName: deriveSiblingPackageName(cliPackageName, 'sdk'),
      uiPackageName: deriveSiblingPackageName(cliPackageName, 'ui'),
      version,
    }
  } catch {
    return {
      cliPackageName: `${FALLBACK_SCOPE}/cli`,
      sdkPackageName: `${FALLBACK_SCOPE}/sdk`,
      uiPackageName: `${FALLBACK_SCOPE}/ui`,
      version: DEFAULT_PACKAGE_VERSION,
    }
  }
}

export function buildCliImportAliases(
  cliConfigDistPath: string,
  cliPackageName: string,
): Record<string, string> {
  return {
    '@whale1/cli': cliConfigDistPath,
    '@whale1/cli/config': cliConfigDistPath,
    [cliPackageName]: cliConfigDistPath,
    [`${cliPackageName}/config`]: cliConfigDistPath,
  }
}
