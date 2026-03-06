import { cpSync, writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { basename, isAbsolute, resolve, join, relative } from 'node:path'
import pc from 'picocolors'
import { DEFAULT_PACKAGE_VERSION, findCliPackageRoot, readCliPackageMeta, type CliPackageMeta } from '../package-meta.js'

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

const TEMPLATE_DIR_ENV = 'WHALE_CREATE_TEMPLATE_DIR'
const DEFAULT_TYPECHECK_SCRIPT = 'tsc -p tsconfig.json --noEmit && tsc -p src/script/tsconfig.json --noEmit'
const LEGACY_CLI_PACKAGE_NAMES = ['@whale/cli', '@whale1/cli']
const LEGACY_SDK_PACKAGE_NAMES = ['@whale/sdk', '@whale1/sdk']
const LEGACY_UI_PACKAGE_NAMES = ['@whale/ui', '@whale1/ui']
const REQUIRED_GITIGNORE_ENTRIES = ['.whale/', 'src-tauri/', 'dist/', 'node_modules/']

const IGNORED_TEMPLATE_PATH_SEGMENTS = new Set([
  'node_modules',
  'dist',
  '.whale',
  '.git',
  '.idea',
  '.vscode',
  'src-tauri',
  'target',
])

const IGNORED_TEMPLATE_FILES = new Set([
  '.DS_Store',
  'bun.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
])

function writeFile(path: string, content: string): void {
  writeFileSync(path, content, 'utf-8')
}

type StringMap = Record<string, string>

interface CreateTemplateOptions {
  templateRoot: string
  projectRoot: string
}

function normalizePackageName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized.length > 0 ? normalized : 'whale-app'
}

function toAppName(projectName: string): string {
  const words = projectName
    .split(/[-_.\s]+/)
    .map((word) => word.trim())
    .filter(Boolean)
  if (words.length === 0) return 'WhaLe Trainer'
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function toIdentifier(packageName: string): string {
  const suffix = packageName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 48)
  return `com.whale.${suffix || 'app'}`
}

function resolveInvocationCwd(): string {
  const initialCwd = process.env.INIT_CWD
  if (initialCwd && initialCwd.trim().length > 0) {
    return resolve(initialCwd)
  }
  return process.cwd()
}

function resolveProjectRoot(name: string, invocationCwd: string): string {
  if (isAbsolute(name)) return resolve(name)
  return resolve(invocationCwd, name)
}

function isTemplateRoot(path: string): boolean {
  return existsSync(join(path, 'package.json')) && existsSync(join(path, 'whale.config.ts')) && existsSync(join(path, 'src'))
}

function resolveTemplateRoot(cliRoot: string): string {
  const explicitTemplateRoot = process.env[TEMPLATE_DIR_ENV]?.trim()
  if (explicitTemplateRoot) {
    const resolved = resolve(explicitTemplateRoot)
    if (!isTemplateRoot(resolved)) {
      throw new Error(`Invalid template directory in ${TEMPLATE_DIR_ENV}: ${resolved}`)
    }
    return resolved
  }

  const packagedTemplate = resolve(cliRoot, 'templates', 'app')
  if (isTemplateRoot(packagedTemplate)) {
    return packagedTemplate
  }

  const monorepoExampleTemplate = resolve(cliRoot, '..', '..', 'apps', 'example')
  if (isTemplateRoot(monorepoExampleTemplate)) {
    return monorepoExampleTemplate
  }

  throw new Error(
    [
      'Unable to locate create template source.',
      `Looked at: ${monorepoExampleTemplate}`,
      `Looked at: ${packagedTemplate}`,
      `You can override by setting ${TEMPLATE_DIR_ENV}.`,
    ].join(' '),
  )
}

function assertTargetIsWritable(root: string): void {
  if (!existsSync(root)) return
  const stat = statSync(root)
  if (!stat.isDirectory()) {
    throw new Error(`Target path exists and is not a directory: ${root}`)
  }
  const entries = readdirSync(root)
  if (entries.length > 0) {
    throw new Error(`Directory is not empty: ${root}`)
  }
}

function shouldCopyTemplatePath(templateRoot: string, sourcePath: string): boolean {
  const relPath = relative(templateRoot, sourcePath)
  if (relPath === '') return true
  const segments = relPath.split(/[\\/]/)
  if (segments.some((segment) => IGNORED_TEMPLATE_PATH_SEGMENTS.has(segment))) {
    return false
  }
  const name = segments[segments.length - 1]
  return !IGNORED_TEMPLATE_FILES.has(name)
}

function copyTemplateProject({ templateRoot, projectRoot }: CreateTemplateOptions): void {
  cpSync(templateRoot, projectRoot, {
    recursive: true,
    filter: (sourcePath) => shouldCopyTemplatePath(templateRoot, sourcePath),
  })
}

function toStringMap(value: unknown): StringMap {
  if (!value || typeof value !== 'object') return {}
  const output: StringMap = {}
  for (const [key, currentValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof currentValue === 'string') {
      output[key] = currentValue
    }
  }
  return output
}

function removeAliases(target: StringMap, packageNames: string[]): void {
  for (const packageName of packageNames) {
    delete target[packageName]
  }
}

function normalizePackageJson(projectRoot: string, packageName: string, pkgMeta: CliPackageMeta): void {
  const packageJsonPath = join(projectRoot, 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as Record<string, unknown>
  const dependencies = toStringMap(packageJson.dependencies)
  const devDependencies = toStringMap(packageJson.devDependencies)
  const scripts = toStringMap(packageJson.scripts)

  removeAliases(dependencies, [...LEGACY_SDK_PACKAGE_NAMES, pkgMeta.sdkPackageName])
  removeAliases(dependencies, [...LEGACY_UI_PACKAGE_NAMES, pkgMeta.uiPackageName])
  dependencies[pkgMeta.sdkPackageName] = `^${pkgMeta.version}`
  dependencies[pkgMeta.uiPackageName] = `^${pkgMeta.version}`
  if (!dependencies['solid-js']) {
    dependencies['solid-js'] = '^1.9.11'
  }

  removeAliases(devDependencies, [...LEGACY_CLI_PACKAGE_NAMES, pkgMeta.cliPackageName])
  devDependencies[pkgMeta.cliPackageName] = `^${pkgMeta.version}`
  if (!devDependencies['@types/frida-gum']) {
    devDependencies['@types/frida-gum'] = '^19.0.2'
  }
  if (!devDependencies.typescript) {
    devDependencies.typescript = '^5.9.3'
  }

  scripts.dev = 'whale dev'
  scripts.build = 'whale build'
  if (!scripts.typecheck) {
    scripts.typecheck = DEFAULT_TYPECHECK_SCRIPT
  }

  packageJson.name = packageName
  packageJson.version = DEFAULT_PACKAGE_VERSION
  packageJson.private = true
  packageJson.type = 'module'
  packageJson.dependencies = dependencies
  packageJson.devDependencies = devDependencies
  packageJson.scripts = scripts
  writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)
}

function escapeSingleQuoted(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function replaceSingleQuotedProperty(source: string, pattern: RegExp, nextValue: string): string {
  return source.replace(pattern, (_full, prefix: string) => `${prefix}'${escapeSingleQuoted(nextValue)}'`)
}

function normalizeWhaleConfig(projectRoot: string, appName: string, identifier: string, pkgMeta: CliPackageMeta): void {
  const configPath = join(projectRoot, 'whale.config.ts')
  let config = readFileSync(configPath, 'utf-8')
  config = config.replace(
    /(import\s+\{\s*defineConfig\s*\}\s+from\s+)(['"])[^'"]+\2/,
    `$1'${escapeSingleQuoted(pkgMeta.cliPackageName)}'`,
  )
  config = replaceSingleQuotedProperty(config, /(app:\s*{[\s\S]*?\bname:\s*)['"][^'"]*['"]/, appName)
  config = replaceSingleQuotedProperty(config, /(app:\s*{[\s\S]*?\bidentifier:\s*)['"][^'"]*['"]/, identifier)
  config = replaceSingleQuotedProperty(config, /(app:\s*{[\s\S]*?\bicon:\s*)['"][^'"]*['"]/, './assets/icon.png')
  config = replaceSingleQuotedProperty(config, /(main:\s*{[\s\S]*?\btitle:\s*)['"][^'"]*['"]/, appName)
  writeFile(configPath, config)
}

function ensureGitIgnore(projectRoot: string): void {
  const gitIgnorePath = join(projectRoot, '.gitignore')
  if (!existsSync(gitIgnorePath)) {
    writeFile(gitIgnorePath, `${REQUIRED_GITIGNORE_ENTRIES.join('\n')}\n`)
    return
  }
  const existingEntries = new Set(
    readFileSync(gitIgnorePath, 'utf-8')
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  )
  let changed = false
  for (const requiredEntry of REQUIRED_GITIGNORE_ENTRIES) {
    if (!existingEntries.has(requiredEntry)) {
      existingEntries.add(requiredEntry)
      changed = true
    }
  }
  if (changed) {
    writeFile(gitIgnorePath, `${Array.from(existingEntries).join('\n')}\n`)
  }
}

function resolveIconSource(templateRoot: string, cliRoot: string): string | undefined {
  const candidates = [
    join(templateRoot, 'assets', 'icon.png'),
    resolve(cliRoot, '..', '..', 'assets', 'icon.png'),
    join(cliRoot, 'templates', 'icon.png'),
  ]
  return candidates.find((candidate) => existsSync(candidate))
}

function copyTemplateIcon(projectRoot: string, templateRoot: string, cliRoot: string): void {
  const iconSource = resolveIconSource(templateRoot, cliRoot)
  if (!iconSource) return
  const assetDir = join(projectRoot, 'assets')
  ensureDir(assetDir)
  const iconTarget = join(assetDir, 'icon.png')
  writeFileSync(iconTarget, readFileSync(iconSource))
}

export async function create(name: string): Promise<void> {
  try {
    const target = name.trim()
    if (target.length === 0) {
      throw new Error('Project name/path is required.')
    }

    const invocationCwd = resolveInvocationCwd()
    const root = resolveProjectRoot(target, invocationCwd)
    const projectName = basename(root)
    const packageName = normalizePackageName(projectName)
    const appName = toAppName(projectName)
    const identifier = toIdentifier(packageName)
    const cliRoot = findCliPackageRoot()
    const templateRoot = resolveTemplateRoot(cliRoot)
    const pkgMeta = readCliPackageMeta()

    assertTargetIsWritable(root)
    ensureDir(root)

    console.log(pc.cyan('[whale]'), `Creating project "${projectName}"...`)
    console.log(pc.dim(`  Target path: ${root}`))
    console.log(pc.dim(`  Template source: ${templateRoot}`))

    copyTemplateProject({ templateRoot, projectRoot: root })
    normalizePackageJson(root, packageName, pkgMeta)
    normalizeWhaleConfig(root, appName, identifier, pkgMeta)
    ensureGitIgnore(root)
    copyTemplateIcon(root, templateRoot, cliRoot)

    console.log(pc.green('[whale]'), 'Project created successfully!')
    console.log()
    console.log('  Next steps:')
    if (resolve(invocationCwd) !== resolve(root)) {
      console.log(pc.dim(`  cd ${root}`))
    }
    console.log(pc.dim('  bun install'))
    console.log(pc.dim('  bun run dev'))
  } catch (error) {
    console.log(pc.red('[whale]'), 'Create command failed')
    console.log(pc.dim(`  ${error instanceof Error ? error.message : String(error)}`))
    process.exit(1)
  }
}
