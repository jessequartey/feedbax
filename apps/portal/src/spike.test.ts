import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CACHE_ETAG,
  cachePayload,
  cookieValue,
  envStatus,
  mutationInput,
  secureCookie,
} from './spike.js'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})
describe('runtime spike primitives', () => {
  it('exposes only a harmless environment summary', () => {
    vi.stubEnv('FEEDBAX_SPIKE_MARKER', 'test')
    expect(envStatus()).toEqual({ marker: 'test' })
  })
  it('creates and reads the secure cookie', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-11T12:00:00Z'))
    const header = secureCookie('2')
    expect(header).toContain('HttpOnly; Secure; SameSite=Lax')
    expect(header).toContain('Path=/')
    expect(header).toContain('Max-Age=3600')
    expect(cookieValue(`other=x; ${header}`)).toBe('2')
  })
  it('validates mutations', () => {
    expect(mutationInput({ action: 'increment' })).toEqual({
      action: 'increment',
    })
    expect(mutationInput({ action: 'delete' })).toBeUndefined()
    expect(mutationInput(null)).toBeUndefined()
  })
  it('keeps cache output deterministic', () => {
    expect(cachePayload()).toEqual({ kind: 'feedbax-spike', version: 1 })
    expect(CACHE_ETAG).toBe('"feedbax-spike-v1"')
  })
})
