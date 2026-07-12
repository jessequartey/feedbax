import config from '../feedbax.config.mjs'
import { runNotionDoctor } from '../connectors/notion/dist/index.js'

const json = process.argv.includes('--json')
const result = await runNotionDoctor(config.connector.setup, {
  token: process.env.NOTION_TOKEN,
  json,
})
process.stdout.write(`${result.output}\n`)
process.exitCode = result.exitCode
