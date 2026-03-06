#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const vitePluginSolidPath = require.resolve('vite-plugin-solid')
const modulePaths = [dirname(vitePluginSolidPath)]
const { transformSync } = require(require.resolve('@babel/core', { paths: modulePaths }))
const solidPresetModule = require(require.resolve('babel-preset-solid', { paths: modulePaths }))
const solidPreset = solidPresetModule.default ?? solidPresetModule

function transformFile(filePath) {
  const original = readFileSync(filePath, 'utf-8')
  const result = transformSync(original, {
    filename: filePath,
    babelrc: false,
    configFile: false,
    sourceMaps: false,
    presets: [[solidPreset, { generate: 'dom', delegateEvents: false }]],
  })

  if (!result?.code) {
    return
  }

  const nextPath = filePath.replace(/\.jsx$/, '.js')
  const rewritten = result.code
    .replace(
      /var (_tmpl\$\w*) = \/\*#__PURE__\*\/_\$template\(([^;]+)\);/g,
      'var $1 = () => /*#__PURE__*/_$template($2)();',
    )
    .replace(
      /(['"])solid-js\/web\1/g,
      '$1solid-js/web/dist/web.js$1',
    )
  writeFileSync(nextPath, rewritten, 'utf-8')
  unlinkSync(filePath)

  const sourceMapPath = `${filePath}.map`
  if (existsSync(sourceMapPath)) {
    unlinkSync(sourceMapPath)
  }
}

function walk(path) {
  if (!existsSync(path)) {
    return
  }

  const stat = statSync(path)
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      walk(join(path, entry))
    }
    return
  }

  if (path.endsWith('.jsx')) {
    transformFile(path)
  }
}

const targetDir = resolve(process.cwd(), process.argv[2] ?? 'dist')
walk(targetDir)
