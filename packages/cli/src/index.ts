#!/usr/bin/env node
import { cac } from 'cac'
import { dev } from './commands/dev.js'
import { build } from './commands/build.js'
import { create } from './commands/create.js'

const cli = cac('whale')

cli.command('dev', 'Start development server').action(() => dev('./whale.config.ts'))
cli.command('build', 'Build for production').action(() => build('./whale.config.ts'))
cli.command('create <name>', 'Create new whale project').action((name: string) => create(name))

cli.help()
cli.version('0.1.0')
cli.parse()
