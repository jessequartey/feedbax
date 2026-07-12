import 'server-only'

import type { HostUser } from '../../src/index'

// Replace these two functions with your application's existing auth adapter.
export async function getHostUser(): Promise<HostUser | null> {
  throw new Error('Connect getHostUser() to the host application session')
}

export async function destroyHostSession(): Promise<void> {
  throw new Error(
    'Connect destroyHostSession() to the host application session',
  )
}
