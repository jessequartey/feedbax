import { afterEach, describe, expect, it, vi } from 'vitest'
import { CACHE_ETAG, cachePayload, cookieValue, envStatus, fetchNotion, mutationInput, secureCookie } from './spike.js'

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
describe('runtime spike primitives', () => {
  it('exposes only a harmless environment summary', () => { vi.stubEnv('NOTION_TOKEN', 'secret'); vi.stubEnv('NOTION_RESOURCE_ID', 'private-id'); vi.stubEnv('FEEDBAX_SPIKE_MARKER', 'test'); expect(envStatus()).toEqual({ marker: 'test', notionConfigured: true }); expect(JSON.stringify(envStatus())).not.toContain('secret') })
  it('creates and reads the secure cookie', () => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-07-11T12:00:00Z')); const header = secureCookie('2'); expect(header).toContain('HttpOnly; Secure; SameSite=Lax'); expect(header).toContain('Path=/'); expect(header).toContain('Max-Age=3600'); expect(cookieValue(`other=x; ${header}`)).toBe('2') })
  it('validates mutations', () => { expect(mutationInput({ action: 'increment' })).toEqual({ action: 'increment' }); expect(mutationInput({ action: 'delete' })).toBeUndefined(); expect(mutationInput(null)).toBeUndefined() })
  it('keeps cache output deterministic', () => { expect(cachePayload()).toEqual({ kind: 'feedbax-spike', version: 1 }); expect(CACHE_ETAG).toBe('"feedbax-spike-v1"') })
  it('performs an authenticated Notion read without returning identifiers', async () => { vi.stubEnv('NOTION_TOKEN', 'secret'); vi.stubEnv('NOTION_RESOURCE_ID', 'page-id'); const fetcher = vi.fn(async () => new Response(JSON.stringify({ object: 'page', id: 'page-id' }), { status: 200 })); await expect(fetchNotion(fetcher as typeof fetch)).resolves.toEqual({ connected: true, object: 'page' }); expect(fetcher).toHaveBeenCalledWith('https://api.notion.com/v1/pages/page-id', expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer secret' }) })) })
  it.each([401, 403, 429, 500])('rejects Notion HTTP %s', async (status) => { vi.stubEnv('NOTION_TOKEN', 'secret'); vi.stubEnv('NOTION_RESOURCE_ID', 'page-id'); await expect(fetchNotion(async () => new Response('', { status }) as never)).rejects.toThrow(`NOTION_HTTP_${status}`) })
  it('rejects missing Notion configuration', async () => { vi.stubEnv('NOTION_TOKEN', ''); vi.stubEnv('NOTION_RESOURCE_ID', ''); await expect(fetchNotion()).rejects.toThrow('NOTION_NOT_CONFIGURED') })
})
