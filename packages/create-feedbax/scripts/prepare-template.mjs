import { cp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
const target = resolve(import.meta.dirname, '../template')
await rm(target, { recursive: true, force: true })
await cp(resolve(import.meta.dirname, '../../../templates/default'), target, {
  recursive: true,
})
