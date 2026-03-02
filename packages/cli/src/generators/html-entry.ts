import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { WhaleConfig } from '../config.js'

export function generateHtmlEntries(
  config: WhaleConfig,
  projectRoot: string,
): Map<string, string> {
  const whaleDir = join(projectRoot, '.whale')
  if (!existsSync(whaleDir)) {
    mkdirSync(whaleDir, { recursive: true })
  }

  const entries = new Map<string, string>()

  for (const [label, windowConfig] of Object.entries(config.windows)) {
    const entryPath = windowConfig.entry
    // Resolve entry relative to projectRoot, then make it relative for Vite
    const resolvedEntry = resolve(projectRoot, entryPath)
    const relativeFromWhale = '../' + entryPath.replace(/^\.\//, '')

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${config.app.name} - ${label}</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="${relativeFromWhale}"></script>
</body>
</html>`

    const htmlPath = join(whaleDir, `${label}.html`)
    writeFileSync(htmlPath, html)
    entries.set(label, htmlPath)
  }

  return entries
}
