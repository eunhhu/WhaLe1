#!/usr/bin/env node
import { cac } from 'cac'
import { dev } from './commands/dev.js'
import { build } from './commands/build.js'
import { create } from './commands/create.js'
import { generateConfig } from './commands/generate-config.js'
import { clean } from './commands/clean.js'
import { readCliPackageMeta } from './package-meta.js'

const cli = cac('whale')

cli.command('dev', 'Start development server').action(() => dev('./whale.config.ts'))
cli.command('build', 'Build for production').action(() => build('./whale.config.ts'))
cli.command('create <name>', 'Create new whale project').action((name: string) => create(name))
cli.command('config:generate [out]', 'Generate tauri config from whale.config.ts')
  .action((out?: string) => generateConfig('./whale.config.ts', out))

cli.command('clean', 'Remove build artifacts and generated files')
  .option('--all', 'Also remove node_modules')
  .action((options: { all?: boolean }) => clean(options))

cli.help()
cli.version(readCliPackageMeta().version)
cli.parse()
