#!/usr/bin/env node
import { createInterface } from 'node:readline/promises'
import {
  createProject,
  resolveCreateOptions,
  resolveInteractiveCreateOptions,
} from './index.js'

try {
  const argv = process.argv.slice(2)
  const interactive = process.stdin.isTTY && process.stdout.isTTY
  const options = interactive
    ? await (async () => {
        const terminal = createInterface({
          input: process.stdin,
          output: process.stdout,
        })
        try {
          return await resolveInteractiveCreateOptions(
            argv,
            async (question, defaultValue) =>
              terminal.question(`${question} [${defaultValue}]: `),
          )
        } finally {
          terminal.close()
        }
      })()
    : resolveCreateOptions(argv)
  const result = await createProject(options)
  process.stdout.write(
    `Created Feedbax in ${result.destination}\n\n${result.nextSteps.join('\n')}\n`,
  )
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exitCode = 1
}
