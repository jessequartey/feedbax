import { defineConfig } from '@feedbax/config'
import { notionConnector } from '@feedbax/notion'
import { AppShell } from '@feedbax/ui'
import { createFileRoute } from '@tanstack/react-router'
const config = defineConfig({ name: 'Feedbax', connector: notionConnector })
export const Route = createFileRoute('/')({ component: Portal })
function Portal() { return <AppShell title={`${config.name} Portal`} description="The workspace foundation is ready."><p>Connector boundary: {config.connector.displayName}</p></AppShell> }
