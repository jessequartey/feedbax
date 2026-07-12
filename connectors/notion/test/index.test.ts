import { describe, expect, it, vi } from 'vitest'
import {
  checkNotionSetup,
  createNotionReadClient,
  createNotionMutationService,
  richText,
  formatNotionHealth,
  notionConnector,
  runNotionDoctor,
  type NotionSetupConfig,
} from '../src/index.js'
import { MemoryCacheAdapter } from '@feedbax/core'

const config: NotionSetupConfig = {
  dataSourceId: 'source-id',
  fields: {
    title: { property: 'Name', type: 'title', writable: true },
    description: { property: 'Description', type: 'rich_text', writable: true },
    feedbackType: { property: 'Type', type: 'select', writable: true },
    status: { property: 'Status', type: 'status', writable: true },
    commentCount: { property: 'Comment count', type: 'number', writable: true },
    optional: { url: { property: 'URL', type: 'url', writable: false } },
  },
  statuses: { open: 'Open', done: 'Done' },
}

const source = {
  properties: {
    Name: { type: 'title' },
    Description: { type: 'rich_text' },
    Type: { type: 'select' },
    Status: {
      type: 'status',
      status: { options: [{ name: 'Open' }, { name: 'Done' }] },
    },
    URL: { type: 'url' },
    'Comment count': { type: 'number' },
  },
}

function response(body: unknown, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
  })
}

function healthyFetch() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url.endsWith('/users/me')) return response({ object: 'user' })
    if (url.endsWith('/data_sources/source-id')) return response(source)
    if (url.endsWith('/data_sources/source-id/query'))
      return response({ results: [{ id: 'page-id' }] })
    if (url.includes('/comments?')) return response({ results: [] })
    return response({}, 500)
  }) as unknown as typeof fetch
}

describe('Notion setup health check', () => {
  it('declares the connector boundary', () =>
    expect(notionConnector.id).toBe('notion'))

  it('passes a complete setup using read-only requests', async () => {
    const fetcher = healthyFetch()
    const result = await checkNotionSetup(config, {
      token: 'secret-token',
      fetch: fetcher,
    })
    expect(result.ok).toBe(true)
    expect(result.checks.at(-1)?.code).toBe('COMMENTS_OK')
    const calls = vi.mocked(fetcher).mock.calls
    expect(
      calls.map((call) => (call[1] as RequestInit | undefined)?.method),
    ).toEqual(['GET', 'GET', 'POST', 'GET'])
    expect((calls[2]?.[1] as RequestInit).body).toBe('{"page_size":1}')
  })

  it('gives an exact repair for a missing token without making a request', async () => {
    const fetcher = vi.fn()
    const result = await checkNotionSetup(config, {
      token: '  ',
      fetch: fetcher,
    })
    expect(result).toEqual({
      ok: false,
      checks: [
        expect.objectContaining({
          code: 'TOKEN_MISSING',
          repair: expect.stringContaining('Set NOTION_TOKEN'),
        }),
      ],
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    [401, 'TOKEN_INVALID'],
    [403, 'TOKEN_FORBIDDEN'],
    [429, 'RATE_LIMITED'],
    [500, 'NOTION_UNAVAILABLE'],
  ] as const)('classifies authentication HTTP %s', async (status, code) => {
    const result = await checkNotionSetup(config, {
      token: 'secret',
      fetch: async () => response('', status),
    })
    expect(result.checks[0]).toMatchObject({
      code,
      status: 'fail',
      repair: expect.any(String),
    })
  })

  it('classifies an inaccessible data source', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith('/users/me') ? response({}) : response('', 404),
    ) as unknown as typeof fetch
    const result = await checkNotionSetup(config, {
      token: 'secret',
      fetch: fetcher,
    })
    expect(result.checks.at(-1)?.code).toBe('DATA_SOURCE_NOT_FOUND')
  })

  it('reports missing and mistyped properties with repairs', async () => {
    const changed = {
      properties: { ...source.properties, Description: { type: 'number' } },
    }
    delete (changed.properties as Partial<typeof changed.properties>).URL
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith('/users/me') ? response({}) : response(changed),
    ) as unknown as typeof fetch
    const result = await checkNotionSetup(config, {
      token: 'secret',
      fetch: fetcher,
    })
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PROPERTY_TYPE_MISMATCH',
          repair: expect.stringContaining('Description'),
        }),
        expect.objectContaining({
          code: 'PROPERTY_MISSING',
          repair: expect.stringContaining('URL'),
        }),
      ]),
    )
  })

  it('rejects unsupported writable property types', async () => {
    const relationConfig: NotionSetupConfig = {
      ...config,
      fields: {
        ...config.fields,
        optional: {
          relation: { property: 'Related', type: 'relation', writable: true },
        },
      },
    }
    const relationSource = {
      properties: { ...source.properties, Related: { type: 'relation' } },
    }
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith('/users/me')
        ? response({})
        : response(relationSource),
    ) as unknown as typeof fetch
    const result = await checkNotionSetup(relationConfig, {
      token: 'secret',
      fetch: fetcher,
    })
    expect(
      result.checks.some(
        (check) => check.code === 'WRITABLE_FIELD_UNSUPPORTED',
      ),
    ).toBe(true)
  })

  it('reports duplicate and missing status mappings', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith('/users/me') ? response({}) : response(source),
    ) as unknown as typeof fetch
    const duplicate = await checkNotionSetup(
      { ...config, statuses: { open: 'Open', done: 'Open' } },
      { token: 'secret', fetch: fetcher },
    )
    expect(duplicate.checks.at(-1)?.code).toBe('STATUS_MAPPING_DUPLICATE')
    const missing = await checkNotionSetup(
      { ...config, statuses: { open: 'Missing' } },
      { token: 'secret', fetch: fetcher },
    )
    expect(missing.checks.at(-1)?.code).toBe('STATUS_OPTION_MISSING')
  })

  it('requires one page for the non-mutating comment check', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/users/me')) return response({})
      if (url.endsWith('/source-id')) return response(source)
      return response({ results: [] })
    }) as unknown as typeof fetch
    const result = await checkNotionSetup(config, {
      token: 'secret',
      fetch: fetcher,
    })
    expect(result.checks.at(-1)).toMatchObject({
      code: 'DATA_SOURCE_EMPTY',
      repair: expect.stringContaining('Add one setup page'),
    })
  })

  it('reports comment access failures', async () => {
    const fetcher = healthyFetch()
    vi.mocked(fetcher).mockImplementation(async (input) =>
      String(input).includes('/comments?')
        ? response('', 403)
        : healthyFetch()(input),
    )
    const result = await checkNotionSetup(config, {
      token: 'secret',
      fetch: fetcher,
    })
    expect(result.checks.at(-1)?.code).toBe('COMMENTS_FORBIDDEN')
  })

  it('never exposes a secret through structured or formatted output', async () => {
    const secret = 'secret-leak-canary'
    const fetcher = async () =>
      response({ message: secret, authorization: `Bearer ${secret}` }, 500)
    const result = await checkNotionSetup(config, {
      token: secret,
      fetch: fetcher,
    })
    expect(JSON.stringify(result)).not.toContain(secret)
    expect(formatNotionHealth(result)).not.toContain(secret)
    expect(
      result.checks.every(
        (check) => check.status === 'pass' || Boolean(check.repair),
      ),
    ).toBe(true)
  })

  it('returns deterministic CLI output and exit codes', async () => {
    const failed = await runNotionDoctor(config, { token: '', json: true })
    expect(failed.exitCode).toBe(1)
    expect(JSON.parse(failed.output)).toMatchObject({ ok: false })
    const passed = await runNotionDoctor(config, {
      token: 'secret',
      fetch: healthyFetch(),
    })
    expect(passed.exitCode).toBe(0)
    expect(passed.output).toContain('Notion setup is healthy.')
  })

  it('sanitizes network errors and timeouts', async () => {
    const result = await checkNotionSetup(config, {
      token: 'secret',
      fetch: async () => {
        throw new Error('secret')
      },
      timeoutMs: 1,
    })
    expect(result.checks[0]?.code).toBe('NOTION_UNAVAILABLE')
    expect(JSON.stringify(result)).not.toContain('secret')
  })
})

describe('Notion cached public reads', () => {
  it('loads a feedback board with one query and no per-item comment calls', async () => {
    const fetcher = vi.fn(async () =>
      response({
        results: [
          {
            id: 'feedback-1',
            created_time: '2026-07-11T12:00:00Z',
            last_edited_time: '2026-07-11T12:00:00Z',
            properties: {
              Name: { type: 'title', title: [{ plain_text: 'Offline mode' }] },
              Description: {
                type: 'rich_text',
                rich_text: [{ plain_text: 'Work anywhere' }],
              },
              Type: { type: 'select', select: { id: 'feature', name: 'Feature' } },
              Status: { type: 'status', status: { id: 'open', name: 'Open' } },
              'Comment count': { type: 'number', number: 7 },
            },
          },
        ],
        has_more: false,
        next_cursor: null,
      }),
    ) as unknown as typeof fetch
    const reader = createNotionReadClient({
      token: 'secret',
      setup: config,
      fetch: fetcher,
      cache: new MemoryCacheAdapter(),
    })
    const first = await reader.listFeedback(
      { sort: 'newest' },
      { pageSize: 20 },
    )
    const second = await reader.listFeedback(
      { sort: 'newest' },
      { pageSize: 20 },
    )
    expect(first.value.items[0]?.commentCount).toBe(7)
    expect(first.cacheStatus).toBe('miss')
    expect(second.cacheStatus).toBe('hit')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(String(vi.mocked(fetcher).mock.calls[0]?.[0])).not.toContain(
      '/comments',
    )
  })

  it('returns empty editorial lists when their sources are not configured', async () => {
    const reader = createNotionReadClient({
      token: 'secret',
      setup: config,
      fetch: vi.fn() as unknown as typeof fetch,
    })
    expect(await reader.listRoadmap({ pageSize: 20 })).toEqual({
      value: { items: [], hasMore: false },
      cacheStatus: 'bypass',
    })
    expect(await reader.listChangelog({ pageSize: 20 })).toEqual({
      value: { items: [], hasMore: false },
      cacheStatus: 'bypass',
    })
  })
})

describe('Notion feedback submission', () => {
  it('chunks rich text at the Notion property limit', () => {
    expect(richText('x'.repeat(4001)).map(({ text }) => text.content.length))
      .toEqual([2000, 2000, 1])
  })

  it('creates a data-source page and returns a canonical public item', async () => {
    const fetcher = vi.fn(async () => response({
      id: 'created-page',
      created_time: '2026-07-12T08:00:00Z',
      last_edited_time: '2026-07-12T08:00:00Z',
    })) as unknown as typeof fetch
    const service = createNotionMutationService({
      token: 'secret',
      setup: {
        ...config,
        fields: {
          ...config.fields,
          optional: {
            category: { property: 'Category', type: 'select', writable: true },
            tags: { property: 'Tags', type: 'multi_select', writable: true },
          },
        },
        categories: { feature: 'Feature' },
        feedbackTypes: { bug: 'Bug' },
        tags: { api: 'API' },
      },
      fetch: fetcher,
    })
    const item = await service.submit({
      title: 'Export failure', description: 'Exports fail for large files.',
      type: 'bug', categoryId: 'feature', tagIds: ['api'],
    }, { id: 'user-1', displayName: 'Ada' })
    expect(item).toMatchObject({ id: 'created-page', type: 'bug', author: { displayName: 'Ada' } })
    const init = vi.mocked(fetcher).mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      parent: { type: 'data_source_id', data_source_id: 'source-id' },
      properties: {
        Type: { select: { name: 'Bug' } },
        Category: { select: { name: 'Feature' } },
        Tags: { multi_select: [{ name: 'API' }] },
      },
    })
    expect(JSON.stringify(body)).not.toContain('ada@example.com')
  })

  it('rejects detail pages outside the configured data source', async () => {
    const reader = createNotionReadClient({
      token: 'secret', setup: config,
      fetch: async () => response({
        id: 'private-page', created_time: '2026-07-12T08:00:00Z',
        last_edited_time: '2026-07-12T08:00:00Z',
        parent: { type: 'data_source_id', data_source_id: 'other-source' },
        properties: {},
      }),
    })
    expect(await reader.getFeedback('private-page')).toBeNull()
  })
})
