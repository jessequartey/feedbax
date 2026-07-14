#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { add, doctor, readMetadata, requiredEnvironment } from './index.js'

const [command, ...args] = process.argv.slice(2)
try {
  if (command === 'doctor') {
    const result = await doctor()
    for (const check of result.checks)
      console.log(
        `${check.status.toUpperCase()} [${check.owner}] ${check.code}: ${check.message}`,
      )
    if (!result.ok) process.exitCode = 1
  } else if (command === 'info')
    console.log(JSON.stringify(await readMetadata(), null, 2))
  else if (command === 'env') console.log(requiredEnvironment.join('\n'))
  else if (command === 'add') {
    const [kind, value] = args
    if (!kind || !value)
      throw new Error(
        'Usage: feedbax add <connector|identity|storage|deploy> <value>',
      )
    await add(kind, value)
    console.log(`Configured ${kind} ${value}.`)
  } else if (command === 'upgrade')
    console.log('No migrations are required for project schema version 1.')
  else if (command === 'dev') {
    const result = await doctor()
    if (!result.ok)
      throw new Error('Preflight checks failed. Run feedbax doctor.')
    spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], {
      stdio: 'inherit',
    })
  } else throw new Error('Usage: feedbax <add|doctor|dev|info|upgrade|env>')
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
