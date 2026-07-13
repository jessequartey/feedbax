const API = 'https://api.notion.com/v1'
const VERSION = '2025-09-03'
const token = process.env.NOTION_TOKEN?.trim()
const parentPageId = process.env.NOTION_PARENT_PAGE_ID?.trim()

if (!token || !parentPageId) {
  throw new Error('NOTION_TOKEN and NOTION_PARENT_PAGE_ID are required.')
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
    throw new Error(
      `Notion ${init.method ?? 'GET'} ${path} failed (${response.status}): ${body.code ?? 'unknown'}`,
    )
  }
  return response.json()
}

const richText = () => ({ rich_text: {} })
const number = () => ({ number: { format: 'number' } })
const select = (names) => ({
  select: {
    options: names.map((name, index) => ({
      name,
      color: ['blue', 'purple', 'orange', 'green', 'red', 'yellow'][index % 6],
    })),
  },
})
const multiSelect = (names) => ({
  multi_select: {
    options: names.map((name, index) => ({
      name,
      color: ['blue', 'purple', 'orange'][index % 3],
    })),
  },
})
const relation = (dataSourceId) => ({
  relation: {
    data_source_id: dataSourceId,
    type: 'single_property',
    single_property: {},
  },
})

async function existingDataSources() {
  const found = []
  let startCursor
  do {
    const result = await notion('/search', {
      method: 'POST',
      body: JSON.stringify({
        filter: { property: 'object', value: 'data_source' },
        page_size: 100,
        ...(startCursor ? { start_cursor: startCursor } : {}),
      }),
    })
    found.push(...result.results)
    startCursor = result.has_more ? result.next_cursor : undefined
  } while (startCursor)
  return found
}

const sources = await existingDataSources()

async function createDatabase(name, properties) {
  const existing = sources.find(
    (source) =>
      source.database_parent?.type === 'page_id' &&
      source.database_parent.page_id.replaceAll('-', '') ===
        parentPageId.replaceAll('-', '') &&
      source.title?.map((item) => item.plain_text).join('') === name,
  )
  if (existing) return existing.id

  const database = await notion('/databases', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'page_id', page_id: parentPageId },
      title: [{ type: 'text', text: { content: name } }],
      is_inline: true,
      initial_data_source: { properties },
    }),
  })
  const dataSourceId = database.data_sources?.[0]?.id
  if (!dataSourceId)
    throw new Error(`Notion did not return a source for ${name}.`)
  sources.push({
    id: dataSourceId,
    title: [{ plain_text: name }],
    database_parent: { type: 'page_id', page_id: parentPageId },
  })
  return dataSourceId
}

async function createSet(label) {
  const feedback = await createDatabase(`${label} — Feedback`, {
    Name: { title: {} },
    Description: richText(),
    Type: select(['Feature', 'Bug', 'Improvement', 'Question']),
    Status: select(['Open', 'Planned', 'In progress', 'Complete']),
    'Comment count': number(),
    Category: select(['Feature', 'Improvement', 'Integration']),
    Tags: multiSelect(['Mobile', 'API', 'Dashboard']),
    'Vote count': number(),
  })
  const votes = await createDatabase(`${label} — Votes`, {
    Key: { title: {} },
    Feedback: relation(feedback),
    'Voter key': richText(),
    Active: { checkbox: {} },
  })
  const comments = await createDatabase(`${label} — Comments`, {
    Key: { title: {} },
    Feedback: relation(feedback),
    Body: richText(),
    'Author ID': richText(),
    'Author name': richText(),
    'Author avatar': { url: {} },
    'Author kind': select(['customer', 'team', 'administrator']),
  })
  const changelog = await createDatabase(`${label} — Changelog`, {
    Name: { title: {} },
    Description: richText(),
    Slug: richText(),
    'Published at': { date: {} },
    Published: { checkbox: {} },
    Version: richText(),
    Tags: multiSelect(['Mobile', 'API', 'Dashboard']),
    'Cover image': { url: {} },
    Feedback: relation(feedback),
  })
  return { feedback, votes, comments, changelog }
}

const provisioned = {
  dogfood: await createSet('Feedbax Dogfood'),
  smoke: await createSet('Feedbax CI Smoke'),
}

console.log(JSON.stringify(provisioned))
