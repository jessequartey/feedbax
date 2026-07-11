import { describe, expect, it } from 'vitest'
import { connectorCapabilities } from '../src/index.js'
describe('connector capabilities', () => { it('are explicit', () => { expect(connectorCapabilities).toContain('comments') }) })
