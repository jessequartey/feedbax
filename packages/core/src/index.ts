export const connectorCapabilities = ['comments', 'atomicVoting', 'webhooks'] as const
export type ConnectorCapability = (typeof connectorCapabilities)[number]

export interface ConnectorDescriptor {
  readonly id: string
  readonly displayName: string
  readonly capabilities: readonly ConnectorCapability[]
}

export type ItemId = string & { readonly __brand: 'ItemId' }
