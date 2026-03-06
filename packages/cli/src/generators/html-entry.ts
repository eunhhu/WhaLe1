import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { WhaleConfig } from '../config.js'
import { readCliPackageMeta } from '../package-meta.js'

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
  outDirAbs: string = join(projectRoot, '.whale'),
): Map<string, string> {
  if (!existsSync(outDirAbs)) {
    mkdirSync(outDirAbs, { recursive: true })
  }

  const entries = new Map<string, string>()
  const pkgMeta = readCliPackageMeta()

  for (const [label, windowConfig] of Object.entries(config.windows)) {
    const entryPath = windowConfig.entry
    const resolvedEntry = resolve(projectRoot, entryPath)
    const relativeEntry = toPosixPath(relative(outDirAbs, resolvedEntry))
    const productionModuleImportPath =
      relativeEntry.startsWith('.') ? relativeEntry : `./${relativeEntry}`
    const moduleImportPath =
      mode === 'development'
        ? `/@fs/${toPosixPath(resolvedEntry)}`
        : productionModuleImportPath
    const bootstrapFileName = toBootstrapFileName(label)
    const bootstrapPath = join(outDirAbs, bootstrapFileName)
    const pageTitle = windowConfig.title
      ? `${config.app.name} - ${windowConfig.title}`
      : `${config.app.name} - ${label}`
    const bootstrapBackgroundStyle = windowConfig.transparent
      ? `<style>
  html, body, #root {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    background: transparent !important;
  }
</style>`
      : ''
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
  <link rel="icon" href="data:," />
  <title>${pageTitle}</title>
  ${bootstrapBackgroundStyle}
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./${bootstrapFileName}"></script>
</body>
</html>`

    const htmlPath = join(outDirAbs, `${label}.html`)
    writeFileSync(bootstrapPath, bootstrap)
    writeFileSync(htmlPath, html)
    entries.set(label, htmlPath)
  }

  // Auto-generate devtools entry in development mode
  if (mode === 'development') {
    const devtoolsBootstrapFileName = '__whale_entry___devtools__.ts'
    const devtoolsBootstrapPath = join(outDirAbs, devtoolsBootstrapFileName)
    const devtoolsBootstrap = `import { createComponent } from 'solid-js'
import { render } from 'solid-js/web'
import DevTools from ${JSON.stringify(`${pkgMeta.sdkPackageName}/devtools`)}

const root = document.getElementById('root')
if (!root) {
  throw new Error('[whale] Missing #root container for "__devtools__" window')
}

render(() => createComponent(DevTools, {}), root)
`

    const devtoolsHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" href="data:," />
  <title>${config.app.name} - DevTools</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./${devtoolsBootstrapFileName}"></script>
</body>
</html>`

    const devtoolsHtmlPath = join(outDirAbs, '__devtools__.html')
    writeFileSync(devtoolsBootstrapPath, devtoolsBootstrap)
    writeFileSync(devtoolsHtmlPath, devtoolsHtml)
    entries.set('__devtools__', devtoolsHtmlPath)
  }

  return entries
}
