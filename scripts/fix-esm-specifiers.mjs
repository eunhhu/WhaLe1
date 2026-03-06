#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const JS_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs']
const PROCESS_EXTENSIONS = new Set(['.js', '.jsx', '.d.ts'])

function hasExplicitExtension(specifier) {
  return /\.[a-z0-9]+$/i.test(specifier)
}

function resolveSpecifier(filePath, specifier) {
  if (!specifier.startsWith('.') || hasExplicitExtension(specifier)) {
    return specifier
  }

  const absoluteBase = resolve(dirname(filePath), specifier)
  for (const extension of JS_EXTENSIONS) {
    if (existsSync(`${absoluteBase}${extension}`)) {
      return `${specifier}${extension}`
    }
  }

  for (const extension of JS_EXTENSIONS) {
    const indexPath = join(absoluteBase, `index${extension}`)
    if (existsSync(indexPath)) {
      return `${specifier.replace(/\/$/, '')}/index${extension}`
    }
  }

  return specifier
}

function rewriteFile(filePath) {
  const original = readFileSync(filePath, 'utf-8')
  const patterns = [
    /(from\s+['"])(\.\.?\/[^'"]+)(['"])/g,
    /(import\s+['"])(\.\.?\/[^'"]+)(['"])/g,
    /(import\s*\(\s*['"])(\.\.?\/[^'"]+)(['"]\s*\))/g,
  ]

  let rewritten = original
  for (const pattern of patterns) {
    rewritten = rewritten.replace(pattern, (_match, prefix, specifier, suffix) => {
      return `${prefix}${resolveSpecifier(filePath, specifier)}${suffix}`
    })
  }

  if (rewritten !== original) {
    writeFileSync(filePath, rewritten, 'utf-8')
  }
}

function walk(path) {
  const stat = statSync(path)
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      walk(join(path, entry))
    }
    return
  }

  for (const extension of PROCESS_EXTENSIONS) {
    if (path.endsWith(extension)) {
      rewriteFile(path)
      return
    }
  }
}

const targetDir = resolve(process.cwd(), process.argv[2] ?? 'dist')
walk(targetDir)
