const API = 'https://api.notion.com/v1'
const VERSION = '2025-09-03'
const title = '[feedbax-ci-setup] Connector health fixture'
const token = process.env.NOTION_TOKEN?.trim()
const dataSourceId = process.env.NOTION_DATA_SOURCE_ID?.trim()

if (!token || !dataSourceId) {
  throw new Error('NOTION_TOKEN and NOTION_DATA_SOURCE_ID are required.')
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
      `Notion smoke preparation failed (${response.status}): ${body.code ?? 'unknown'}.`,
    )
  }
  return response.json()
}

const existing = await notion(`/data_sources/${dataSourceId}/query`, {
  method: 'POST',
  body: JSON.stringify({
    page_size: 1,
    filter: { property: 'Name', title: { equals: title } },
  }),
})

if (existing.results.length === 0) {
  const richText = (content) => [{ type: 'text', text: { content } }]
  await notion('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'data_source_id', data_source_id: dataSourceId },
      properties: {
        Name: { title: richText(title) },
        Description: {
          rich_text: richText(
            'Synthetic CI-only page retained so Notion doctor can verify native comment access.',
          ),
        },
        Type: { select: { name: 'Question' } },
        Status: { select: { name: 'Open' } },
        'Comment count': { number: 0 },
        'Vote count': { number: 0 },
      },
    }),
  })
  console.log('Created the synthetic Notion smoke setup fixture.')
} else {
  console.log('The synthetic Notion smoke setup fixture is ready.')
}
