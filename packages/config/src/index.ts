import type { ConnectorDescriptor } from '@feedbax/core'
export interface FeedbaxConfig { readonly name: string; readonly connector: ConnectorDescriptor }
export const defineConfig = (config: FeedbaxConfig): FeedbaxConfig => config
