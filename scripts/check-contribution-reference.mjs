const eventPath = process.env.GITHUB_EVENT_PATH
if (!eventPath) {
  console.log('No GitHub event; contribution reference check skipped.')
  process.exit(0)
}

const { readFile } = await import('node:fs/promises')
const event = JSON.parse(await readFile(eventPath, 'utf8'))
const pullRequest = event.pull_request
if (!pullRequest) {
  console.log('Not a pull request; contribution reference check skipped.')
  process.exit(0)
}

const body = pullRequest.body ?? ''
const labels = (pullRequest.labels ?? []).map(({ name }) => name)
const item =
  /Feedbax item:\s*https:\/\/feedbax-feedback\.jessefquartey\.workers\.dev\/feedback\/[A-Za-z0-9_-]+/i.test(
    body,
  )
const exception = labels.includes('feedbax-exempt')
const reason = /Maintainer exception reason:\s*\S.+/i.test(body)

if (!item && !(exception && reason)) {
  throw new Error(
    'Link a canonical Feedbax item, or have a maintainer apply feedbax-exempt and provide a reason.',
  )
}

console.log(item ? 'Feedbax item linked.' : 'Maintainer exception recorded.')
