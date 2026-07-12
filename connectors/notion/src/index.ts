import type { ConnectorDescriptor } from '@feedbax/core'
export * from './reads.js'
export * from './mutations.js'

export const NOTION_API_VERSION = '2025-09-03'

export const notionConnector = {
  id: 'notion',
  displayName: 'Notion',
  capabilities: ['comments'],
} as const satisfies ConnectorDescriptor

export type NotionPropertyType =
  | 'title'
  | 'rich_text'
  | 'status'
  | 'select'
  | 'number'
  | 'checkbox'
  | 'date'
  | 'people'
  | 'url'
  | 'email'
  | 'multi_select'
  | 'relation'
  | 'rollup'
  | 'formula'
  | 'files'
  | 'created_time'
  | 'created_by'
  | 'last_edited_time'
  | 'last_edited_by'

export interface NotionFieldMapping {
  readonly property: string
  readonly type: NotionPropertyType
  readonly writable: boolean
}

export interface NotionSetupConfig {
  readonly dataSourceId: string
  readonly fields: {
    readonly title: NotionFieldMapping
    readonly description: NotionFieldMapping
    readonly feedbackType: NotionFieldMapping & { readonly type: 'select' }
    readonly status: NotionFieldMapping & { readonly type: 'status' | 'select' }
    readonly commentCount: NotionFieldMapping & { readonly type: 'number' }
    readonly optional?: Readonly<Record<string, NotionFieldMapping>>
  }
  readonly statuses: Readonly<Record<string, string>>
  readonly categories?: Readonly<Record<string, string>>
  readonly feedbackTypes?: Readonly<Record<string, string>>
  readonly tags?: Readonly<Record<string, string>>
}

export type NotionHealthCode =
  | 'TOKEN_OK'
  | 'TOKEN_MISSING'
  | 'TOKEN_INVALID'
  | 'TOKEN_FORBIDDEN'
  | 'DATA_SOURCE_OK'
  | 'DATA_SOURCE_ID_MISSING'
  | 'DATA_SOURCE_NOT_FOUND'
  | 'PROPERTY_OK'
  | 'PROPERTY_MISSING'
  | 'PROPERTY_TYPE_MISMATCH'
  | 'WRITABLE_FIELDS_OK'
  | 'WRITABLE_FIELD_UNSUPPORTED'
  | 'STATUS_MAPPINGS_OK'
  | 'STATUS_MAPPING_DUPLICATE'
  | 'STATUS_OPTION_MISSING'
  | 'COMMENTS_OK'
  | 'DATA_SOURCE_EMPTY'
  | 'COMMENTS_FORBIDDEN'
  | 'RATE_LIMITED'
  | 'NOTION_UNAVAILABLE'
  | 'INVALID_RESPONSE'

export interface NotionHealthCheck {
  readonly code: NotionHealthCode
  readonly status: 'pass' | 'fail'
  readonly summary: string
  readonly repair?: string
}

export interface NotionHealthResult {
  readonly ok: boolean
  readonly checks: readonly NotionHealthCheck[]
}

export interface NotionHealthOptions {
  readonly token?: string
  readonly fetch?: typeof fetch
  readonly timeoutMs?: number
}

const API = 'https://api.notion.com/v1'
const writableTypes = new Set<NotionPropertyType>([
  'title',
  'rich_text',
  'status',
  'select',
  'number',
  'checkbox',
  'date',
  'people',
  'url',
  'email',
  'multi_select',
])

const pass = (code: NotionHealthCode, summary: string): NotionHealthCheck => ({
  code,
  status: 'pass',
  summary,
})
const fail = (
  code: NotionHealthCode,
  summary: string,
  repair: string,
): NotionHealthCheck => ({ code, status: 'fail', summary, repair })

class SafeNotionError extends Error {
  constructor(
    readonly kind:
      | 'unauthorized'
      | 'forbidden'
      | 'not_found'
      | 'rate_limited'
      | 'unavailable'
      | 'invalid',
  ) {
    super(kind)
  }
}

async function request(
  fetcher: typeof fetch,
  token: string,
  path: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let response: Response
    try {
      response = await fetcher(`${API}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          'notion-version': NOTION_API_VERSION,
          'content-type': 'application/json',
        },
        signal: controller.signal,
      })
    } catch {
      throw new SafeNotionError('unavailable')
    }
    if (response.status === 401) throw new SafeNotionError('unauthorized')
    if (response.status === 403) throw new SafeNotionError('forbidden')
    if (response.status === 404) throw new SafeNotionError('not_found')
    if (response.status === 429) throw new SafeNotionError('rate_limited')
    if (!response.ok) throw new SafeNotionError('unavailable')
    try {
      return (await response.json()) as unknown
    } catch {
      throw new SafeNotionError('invalid')
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function checkNotionSetup(
  config: NotionSetupConfig,
  options: NotionHealthOptions = {},
): Promise<NotionHealthResult> {
  const checks: NotionHealthCheck[] = []
  const token = options.token?.trim() ?? ''
  const fetcher = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? 5000
  if (!token)
    return {
      ok: false,
      checks: [
        fail(
          'TOKEN_MISSING',
          'NOTION_TOKEN is missing.',
          'Set NOTION_TOKEN to the internal integration secret, then run `pnpm notion:doctor` again. Never prefix this variable with VITE_.',
        ),
      ],
    }
  try {
    await request(fetcher, token, '/users/me', { method: 'GET' }, timeoutMs)
    checks.push(pass('TOKEN_OK', 'The Notion API token is valid.'))
  } catch (error) {
    const kind = error instanceof SafeNotionError ? error.kind : 'unavailable'
    if (kind === 'unauthorized')
      checks.push(
        fail(
          'TOKEN_INVALID',
          'Notion rejected the API token.',
          'Copy the current internal integration secret into NOTION_TOKEN, then run `pnpm notion:doctor` again.',
        ),
      )
    else if (kind === 'forbidden')
      checks.push(
        fail(
          'TOKEN_FORBIDDEN',
          'The integration cannot authenticate.',
          'Enable the integration in the Notion workspace and replace NOTION_TOKEN with its current secret.',
        ),
      )
    else if (kind === 'rate_limited')
      checks.push(
        fail(
          'RATE_LIMITED',
          'Notion rate-limited the health check.',
          'Wait for the Notion rate limit to reset, then run `pnpm notion:doctor` again.',
        ),
      )
    else
      checks.push(
        fail(
          'NOTION_UNAVAILABLE',
          'Notion could not be reached.',
          'Check outbound HTTPS access to api.notion.com and retry `pnpm notion:doctor`.',
        ),
      )
    return { ok: false, checks }
  }
  if (!config.dataSourceId.trim()) {
    checks.push(
      fail(
        'DATA_SOURCE_ID_MISSING',
        'The Notion data source ID is missing.',
        'Set `connector.setup.dataSourceId` in feedbax.config.mjs to the data source ID returned for the shared Notion database.',
      ),
    )
    return { ok: false, checks }
  }
  let source: {
    properties: Record<
      string,
      {
        type?: unknown
        status?: { options?: { name?: unknown }[] }
        select?: { options?: { name?: unknown }[] }
      }
    >
  }
  try {
    const value = (await request(
      fetcher,
      token,
      `/data_sources/${encodeURIComponent(config.dataSourceId)}`,
      { method: 'GET' },
      timeoutMs,
    )) as Partial<typeof source>
    if (!value.properties || typeof value.properties !== 'object')
      throw new SafeNotionError('invalid')
    source = value as typeof source
    checks.push(
      pass(
        'DATA_SOURCE_OK',
        'The integration can access the Notion data source.',
      ),
    )
  } catch (error) {
    const kind = error instanceof SafeNotionError ? error.kind : 'unavailable'
    if (kind === 'not_found' || kind === 'forbidden')
      checks.push(
        fail(
          'DATA_SOURCE_NOT_FOUND',
          'The configured Notion data source is not accessible.',
          "Open the database in Notion, choose Connections, add this integration, and confirm `dataSourceId` is one of that database's data source IDs.",
        ),
      )
    else if (kind === 'rate_limited')
      checks.push(
        fail(
          'RATE_LIMITED',
          'Notion rate-limited the data source check.',
          'Wait for the Notion rate limit to reset, then run `pnpm notion:doctor` again.',
        ),
      )
    else if (kind === 'invalid')
      checks.push(
        fail(
          'INVALID_RESPONSE',
          'Notion returned an invalid data source response.',
          'Confirm the configured ID identifies a database data source and retry with the supported Notion API version.',
        ),
      )
    else
      checks.push(
        fail(
          'NOTION_UNAVAILABLE',
          'The Notion data source check failed.',
          'Check Notion service availability and outbound HTTPS access, then retry.',
        ),
      )
    return { ok: false, checks }
  }
  const mappings: [string, NotionFieldMapping][] = [
    ['title', config.fields.title],
    ['description', config.fields.description],
    ['status', config.fields.status],
    ['commentCount', config.fields.commentCount],
    ...Object.entries(config.fields.optional ?? {}).map(
      ([name, mapping]) =>
        [`optional.${name}`, mapping] as [string, NotionFieldMapping],
    ),
  ]
  for (const [name, mapping] of mappings) {
    const actual = source.properties[mapping.property]
    if (!actual)
      checks.push(
        fail(
          'PROPERTY_MISSING',
          `Mapped field "${name}" cannot find Notion property "${mapping.property}".`,
          `Create a Notion property named "${mapping.property}" with type "${mapping.type}", or update the "${name}" mapping.`,
        ),
      )
    else if (actual.type !== mapping.type)
      checks.push(
        fail(
          'PROPERTY_TYPE_MISMATCH',
          `Notion property "${mapping.property}" is not type "${mapping.type}".`,
          `Change "${mapping.property}" to type "${mapping.type}" in Notion, or update the "${name}" mapping to its actual type.`,
        ),
      )
    else
      checks.push(
        pass(
          'PROPERTY_OK',
          `Property "${mapping.property}" matches type "${mapping.type}".`,
        ),
      )
  }
  const unsupported = mappings.find(
    ([, mapping]) => mapping.writable && !writableTypes.has(mapping.type),
  )
  checks.push(
    unsupported
      ? fail(
          'WRITABLE_FIELD_UNSUPPORTED',
          `Writable property "${unsupported[1].property}" has an unsupported type.`,
          `Change "${unsupported[1].property}" to a supported writable type or set its mapping to writable: false.`,
        )
      : pass(
          'WRITABLE_FIELDS_OK',
          'Writable fields are schema-compatible (no content was changed).',
        ),
  )
  const mappedOptions = Object.values(config.statuses)
  const duplicate = mappedOptions.find(
    (value, index) => mappedOptions.indexOf(value) !== index,
  )
  const statusProperty = source.properties[config.fields.status.property]
  const optionsList =
    config.fields.status.type === 'status'
      ? statusProperty?.status?.options
      : statusProperty?.select?.options
  const available = new Set(
    (optionsList ?? []).flatMap((option) =>
      typeof option.name === 'string' ? [option.name] : [],
    ),
  )
  if (duplicate)
    checks.push(
      fail(
        'STATUS_MAPPING_DUPLICATE',
        `Notion status option "${duplicate}" is mapped more than once.`,
        `Map each Feedbax status ID to a unique Notion option in feedbax.config.mjs.`,
      ),
    )
  else {
    const missing = Object.entries(config.statuses).find(
      ([, value]) => !available.has(value),
    )
    checks.push(
      missing
        ? fail(
            'STATUS_OPTION_MISSING',
            `Mapped Notion status option "${missing[1]}" does not exist.`,
            `Create the "${missing[1]}" option on "${config.fields.status.property}", or update the "${missing[0]}" status mapping.`,
          )
        : pass(
            'STATUS_MAPPINGS_OK',
            'All configured status mappings exist and are unique.',
          ),
    )
  }
  if (!checks.some((check) => check.status === 'fail')) {
    try {
      const query = (await request(
        fetcher,
        token,
        `/data_sources/${encodeURIComponent(config.dataSourceId)}/query`,
        { method: 'POST', body: JSON.stringify({ page_size: 1 }) },
        timeoutMs,
      )) as { results?: unknown[] }
      if (!Array.isArray(query.results)) throw new SafeNotionError('invalid')
      const page = query.results[0] as { id?: unknown } | undefined
      if (!page || typeof page.id !== 'string')
        checks.push(
          fail(
            'DATA_SOURCE_EMPTY',
            'Comment capability cannot be checked because the data source is empty.',
            'Add one setup page to the Notion database, then run `pnpm notion:doctor` again.',
          ),
        )
      else {
        await request(
          fetcher,
          token,
          `/comments?block_id=${encodeURIComponent(page.id)}&page_size=1`,
          { method: 'GET' },
          timeoutMs,
        )
        checks.push(
          pass(
            'COMMENTS_OK',
            'The integration can read comments without changing content.',
          ),
        )
      }
    } catch (error) {
      const kind = error instanceof SafeNotionError ? error.kind : 'unavailable'
      if (kind === 'forbidden' || kind === 'not_found')
        checks.push(
          fail(
            'COMMENTS_FORBIDDEN',
            'The integration cannot read comments for a database page.',
            'Enable the integration Read comments capability and share the database with the integration, then retry.',
          ),
        )
      else if (kind === 'rate_limited')
        checks.push(
          fail(
            'RATE_LIMITED',
            'Notion rate-limited the comment check.',
            'Wait for the Notion rate limit to reset, then run `pnpm notion:doctor` again.',
          ),
        )
      else if (kind === 'invalid')
        checks.push(
          fail(
            'INVALID_RESPONSE',
            'Notion returned an invalid query response.',
            'Confirm the configured resource is a database data source and retry.',
          ),
        )
      else
        checks.push(
          fail(
            'NOTION_UNAVAILABLE',
            'The comment capability check failed.',
            'Check Notion availability and outbound HTTPS access, then retry.',
          ),
        )
    }
  }
  return { ok: checks.every((check) => check.status === 'pass'), checks }
}

export function formatNotionHealth(result: NotionHealthResult): string {
  const lines = result.checks.map(
    (check) =>
      `${check.status === 'pass' ? 'PASS' : 'FAIL'} ${check.code}: ${check.summary}${check.repair ? `\n  Repair: ${check.repair}` : ''}`,
  )
  return [
    ...lines,
    result.ok ? 'Notion setup is healthy.' : 'Notion setup is not healthy.',
  ].join('\n')
}

export async function runNotionDoctor(
  config: NotionSetupConfig,
  options: NotionHealthOptions & { readonly json?: boolean } = {},
): Promise<{ readonly exitCode: 0 | 1; readonly output: string }> {
  const result = await checkNotionSetup(config, options)
  return {
    exitCode: result.ok ? 0 : 1,
    output: options.json
      ? JSON.stringify(result, null, 2)
      : formatNotionHealth(result),
  }
}
