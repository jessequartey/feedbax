#!/usr/bin/env node
import { createProject, resolveCreateOptions } from './index.js'

try {
  const options = resolveCreateOptions(process.argv.slice(2))
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
