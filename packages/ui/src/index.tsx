import type { PropsWithChildren } from 'react'
export interface AppShellProps extends PropsWithChildren {
  readonly title: string
  readonly description: string
}
export function AppShell({ title, description, children }: AppShellProps) {
  return (
    <main>
      <header>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </main>
  )
}
