import { describe, expect, it } from 'vitest'
import { defineConfig } from '../src/index.js'
describe('defineConfig', () => { it('preserves typed input', () => { const value = defineConfig({ name: 'Feedbax', connector: { id: 'test', displayName: 'Test', capabilities: [] } }); expect(value.name).toBe('Feedbax') }) })
