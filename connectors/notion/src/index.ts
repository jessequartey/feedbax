import type { ConnectorDescriptor } from '@feedbax/core'
export const notionConnector = {
  id: 'notion',
  displayName: 'Notion',
  capabilities: ['comments'],
} as const satisfies ConnectorDescriptor
