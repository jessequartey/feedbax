import { createFileRoute, notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useFumadocsLoader } from 'fumadocs-core/source/client'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page'
import browserCollections from '../../.source/browser'
import { Suspense } from 'react'
import { getMDXComponents } from '../components/mdx'
import { source } from '../lib/source'

const loadDoc = createServerFn({ method: 'GET' })
  .validator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs)
    if (!page) throw notFound()
    return {
      path: page.path,
      title: page.data.title,
      description: page.data.description,
      pageTree: await source.serializePageTree(source.getPageTree()),
    }
  })

const clientLoader = browserCollections.docs.createClientLoader({
  component(page, props: { title: string; description?: string | undefined }) {
    const Body = page.default
    return <DocsPage toc={page.toc}><DocsTitle>{props.title}</DocsTitle><DocsDescription>{props.description}</DocsDescription><DocsBody><Body components={getMDXComponents()} /></DocsBody></DocsPage>
  },
})

export const Route = createFileRoute('/docs/$')({
  loader: async ({ params }) => {
    const slugs = params._splat?.split('/').filter(Boolean) ?? []
    const data = await loadDoc({ data: slugs })
    await clientLoader.preload(data.path)
    return data
  },
  head: ({ loaderData }) => ({
    meta: loaderData ? [
      { title: `${loaderData.title} — Feedbax` },
      { name: 'description', content: loaderData.description },
    ] : [],
  }),
  component: DocsRoute,
})

function DocsRoute() {
  const page = useFumadocsLoader(Route.useLoaderData())
  return <DocsLayout tree={page.pageTree} nav={{ enabled: false }} searchToggle={{ enabled: false }} themeSwitch={{ enabled: false }} sidebar={{ collapsible: false }}><Suspense fallback={<div className="docs-loading">Loading documentation…</div>}>{clientLoader.useContent(page.path, page)}</Suspense></DocsLayout>
}
