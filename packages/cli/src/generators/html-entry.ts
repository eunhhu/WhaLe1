import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { WhaleConfig } from '../config.js'

export type HtmlEntryMode = 'development' | 'production'

function toPosixPath(path: string): string {
  return path.replace(/\\/g, '/')
}

function toBootstrapFileName(label: string): string {
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `__whale_entry_${safeLabel}.ts`
}

export function generateHtmlEntries(
  config: WhaleConfig,
  projectRoot: string,
  mode: HtmlEntryMode,
): Map<string, string> {
  const whaleDir = join(projectRoot, '.whale')
  if (!existsSync(whaleDir)) {
    mkdirSync(whaleDir, { recursive: true })
  }

  const entries = new Map<string, string>()

  for (const [label, windowConfig] of Object.entries(config.windows)) {
    const entryPath = windowConfig.entry
    const resolvedEntry = resolve(projectRoot, entryPath)
    const moduleImportPath =
      mode === 'development'
        ? `/@fs/${toPosixPath(resolvedEntry)}`
        : '../' + entryPath.replace(/^\.\//, '')
    const bootstrapFileName = toBootstrapFileName(label)
    const bootstrapPath = join(whaleDir, bootstrapFileName)
    const bootstrap = `import { createComponent } from 'solid-js'
import { render } from 'solid-js/web'
import * as WindowModule from ${JSON.stringify(moduleImportPath)}

type WindowModuleType = typeof WindowModule
type WindowComponent = ((props: Record<string, never>) => unknown) | undefined

const root = document.getElementById('root')
if (!root) {
  throw new Error('[whale] Missing #root container for "${label}" window')
}

const mount = (mod: WindowModuleType): (() => void) | undefined => {
  const Entry = mod.default as WindowComponent
  if (typeof Entry !== 'function') {
    return undefined
  }
  return render(() => createComponent(Entry, {}), root)
}

let dispose = mount(WindowModule)

if (import.meta.hot) {
  import.meta.hot.accept(${JSON.stringify(moduleImportPath)}, (nextModule) => {
    dispose?.()
    dispose = mount((nextModule as WindowModuleType) ?? WindowModule)
  })
}
`

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${config.app.name} - ${label}</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./${bootstrapFileName}"></script>
</body>
</html>`

    const htmlPath = join(whaleDir, `${label}.html`)
    writeFileSync(bootstrapPath, bootstrap)
    writeFileSync(htmlPath, html)
    entries.set(label, htmlPath)
  }

  return entries
}
