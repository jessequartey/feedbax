import { AppShell } from '@feedbax/ui'
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <AppShell title="Feedbax" description="Own your feedback. Keep your existing workflow."><p>Documentation and product content will land in later slices.</p></AppShell> })
