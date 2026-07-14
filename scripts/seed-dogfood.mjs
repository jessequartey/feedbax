const API = 'https://api.notion.com/v1'
const VERSION = '2025-09-03'
const token = process.env.NOTION_TOKEN?.trim()
const feedbackSource = process.env.NOTION_DATA_SOURCE_ID?.trim()
const changelogSource = process.env.NOTION_CHANGELOG_DATA_SOURCE_ID?.trim()

if (!token || !feedbackSource || !changelogSource) {
  throw new Error(
    'NOTION_TOKEN, NOTION_DATA_SOURCE_ID, and NOTION_CHANGELOG_DATA_SOURCE_ID are required.',
  )
}

async function notion(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'notion-version': VERSION,
      ...init.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(`Notion seed failed (${response.status}): ${body.code}.`)
  }
  return response.json()
}

const text = (content) => [{ type: 'text', text: { content } }]

async function findByTitle(dataSourceId, property, title) {
  const result = await notion(`/data_sources/${dataSourceId}/query`, {
    method: 'POST',
    body: JSON.stringify({
      page_size: 1,
      filter: { property, title: { equals: title } },
    }),
  })
  return result.results[0]
}

async function feedback(item) {
  const existing = await findByTitle(feedbackSource, 'Name', item.title)
  if (existing) return existing
  return notion('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'data_source_id', data_source_id: feedbackSource },
      properties: {
        Name: { title: text(item.title) },
        Description: { rich_text: text(item.description) },
        Type: { select: { name: item.type } },
        Status: { select: { name: item.status } },
        'Comment count': { number: 0 },
        Category: { select: { name: item.category } },
        Tags: { multi_select: item.tags.map((name) => ({ name })) },
        'Vote count': { number: 0 },
      },
    }),
  })
}

const items = [
  {
    title: 'Public roadmap and changelog',
    description:
      'Publish roadmap status and product updates from the same Notion-backed portal.',
    type: 'Feature',
    status: 'In progress',
    category: 'Feature',
    tags: ['Dashboard'],
  },
  {
    title: 'Embedded feedback and changelog widgets',
    description:
      'Offer embeddable surfaces after the Notion MVP is stable and documented.',
    type: 'Feature',
    status: 'Open',
    category: 'Feature',
    tags: ['API'],
  },
  {
    title: 'GitHub connector and controlled issue promotion',
    description:
      'Add a connector that can promote selected feedback into GitHub without coupling core behavior to GitHub.',
    type: 'Feature',
    status: 'Open',
    category: 'Integration',
    tags: ['API'],
  },
  {
    title: 'Linear connector',
    description:
      'Map customer feedback and roadmap state to Linear while preserving Feedbax connector boundaries.',
    type: 'Feature',
    status: 'Open',
    category: 'Integration',
    tags: ['API'],
  },
  {
    title: 'Google Sheets connector',
    description:
      'Support a spreadsheet backend for teams that are not ready for a work-tracking platform.',
    type: 'Feature',
    status: 'Open',
    category: 'Integration',
    tags: ['API'],
  },
  {
    title: 'Generic API connector',
    description:
      'Publish a provider-neutral connector contract for custom backends and automation tools.',
    type: 'Feature',
    status: 'Open',
    category: 'Integration',
    tags: ['API'],
  },
  {
    title: 'Status notifications and digest delivery',
    description:
      'Notify opted-in customers when feedback changes status or ships through pluggable adapters.',
    type: 'Feature',
    status: 'Open',
    category: 'Feature',
    tags: ['Dashboard'],
  },
  {
    title: 'SQLite, Postgres, and Better Auth options',
    description:
      'Add stronger interaction stores and verified authentication after the Notion preview is stable.',
    type: 'Feature',
    status: 'Open',
    category: 'Improvement',
    tags: ['API'],
  },
  {
    title: 'Import, export, and migration tools',
    description:
      'Let operators move feedback without losing ownership of their data.',
    type: 'Improvement',
    status: 'Open',
    category: 'Improvement',
    tags: ['Dashboard'],
  },
  {
    title: 'Make Cloudflare-only modules portable across build targets',
    description:
      'Rollout issue: the Durable Object environment import initially broke the portable Node build and development dependency scan. The Worker-only binding is now isolated in the Cloudflare entrypoint.',
    type: 'Bug',
    status: 'Complete',
    category: 'Improvement',
    tags: ['API'],
  },
  {
    title: 'Dogfood on Feedbax and one external team project',
    description:
      'Operate Feedbax’s own feedback board first, record real failures, then validate the documented path with an external adopter.',
    type: 'Improvement',
    status: 'In progress',
    category: 'Improvement',
    tags: ['Dashboard'],
  },
]

const seeded = []
for (const item of items) seeded.push(await feedback(item))

const changelogTitle = 'Feedbax dogfood board launched'
if (!(await findByTitle(changelogSource, 'Name', changelogTitle))) {
  const operationalIssue = seeded.find(
    (page) =>
      page.properties?.Name?.title?.[0]?.plain_text ===
      'Make Cloudflare-only modules portable across build targets',
  )
  await notion('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'data_source_id', data_source_id: changelogSource },
      properties: {
        Name: { title: text(changelogTitle) },
        Description: {
          rich_text: text(
            'The first production Feedbax installation is live on Cloudflare Workers with Notion-backed feedback, roadmap, changelog, voting, and comments.',
          ),
        },
        Slug: { rich_text: text('dogfood-board-launched') },
        'Published at': { date: { start: '2026-07-13' } },
        Published: { checkbox: true },
        Version: { rich_text: text('dogfood-1') },
        Tags: { multi_select: [{ name: 'Dashboard' }] },
        Feedback: operationalIssue
          ? { relation: [{ id: operationalIssue.id }] }
          : { relation: [] },
      },
    }),
  })
}

console.log(`Seeded ${items.length} dogfood roadmap items and one changelog.`)
