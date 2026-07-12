import type { ConnectorDescriptor } from '@feedbax/core'
import type { NotionSetupConfig } from '@feedbax/notion'
export interface FeedbaxConfig {
  readonly name: string
  readonly connector:
    | ConnectorDescriptor
    | (ConnectorDescriptor & {
        readonly id: 'notion'
        readonly setup: NotionSetupConfig
      })
}
export const defineConfig = (config: FeedbaxConfig): FeedbaxConfig => config
