import { describe, expectTypeOf, it } from 'vitest'
import type { IdentityProvider } from '../src/index.js'
describe('identity boundary', () => { it('requires verification', () => { expectTypeOf<IdentityProvider>().toHaveProperty('verify') }) })
