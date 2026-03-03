import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const cliRoot = resolve(scriptDir, '..')
const repoRoot = resolve(cliRoot, '..', '..')
const target = resolve(cliRoot, 'templates', 'app')
const sourceFromEnv = process.env.WHALE_CREATE_TEMPLATE_SOURCE?.trim()
const source = sourceFromEnv ? resolve(sourceFromEnv) : undefined

const ignoredPathSegments = new Set([
  'node_modules',
  'dist',
  '.whale',
  '.git',
  '.idea',
  '.vscode',
  'src-tauri',
  'target',
])

const ignoredFiles = new Set([
  '.DS_Store',
  'bun.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
])

if (!source) {
  console.warn('[whale] template sync skipped: set WHALE_CREATE_TEMPLATE_SOURCE to enable sync')
  process.exit(0)
}

if (!existsSync(source)) {
  console.warn(`[whale] template sync skipped: source not found at ${source}`)
  process.exit(0)
}

if (resolve(source) === resolve(target)) {
  console.warn(`[whale] template sync skipped: source and target are the same (${source})`)
  process.exit(0)
}

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })

cpSync(source, target, {
  recursive: true,
  filter: (sourcePath) => {
    const relPath = relative(source, sourcePath)
    if (relPath === '') return true
    const segments = relPath.split(/[\\/]/)
    if (segments.some((segment) => ignoredPathSegments.has(segment))) return false
    const filename = segments[segments.length - 1]
    return !ignoredFiles.has(filename)
  },
})

console.log(`[whale] synced create template: ${relative(repoRoot, target)} <= ${relative(repoRoot, source)}`)
