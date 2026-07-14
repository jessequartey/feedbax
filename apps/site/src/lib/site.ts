export const githubUrl = 'https://github.com/jessequartey/feedbax'
export const feedbackPortalUrl =
  'https://feedbax-feedback.jessefquartey.workers.dev'
export const notionStarterUrl =
  'https://brave-number-c98.notion.site/Feedbax-Notion-Starter-39dafe1596918155a94cc24a1a41a2a5'

export const statusLabels = [
  'Available',
  'Preview available',
  'Release prerequisite',
  'Deferred',
] as const

export type StatusLabel = (typeof statusLabels)[number]

export const docsNavigation = [
  {
    slug: '',
    title: 'Introduction',
    description: 'What Feedbax is and what exists today.',
  },
  {
    slug: 'product-vision',
    title: 'Product vision',
    description: 'The problem, thesis, principles, and non-goals.',
  },
  {
    slug: 'quickstart',
    title: 'Quickstart',
    description: 'Generate, configure, diagnose, and run a Feedbax project.',
  },
  {
    slug: 'configuration',
    title: 'Configuration',
    description: 'Validated portal branding, behavior, and connector settings.',
  },
  {
    slug: 'authentication-handoff',
    title: 'Authentication handoff',
    description: 'Reuse identity from your existing application.',
  },
  {
    slug: 'notion-setup',
    title: 'Notion setup',
    description: 'Prepare the only connector supported for v0.1.0.',
  },
  {
    slug: 'deployment',
    title: 'Deployment',
    description: 'Static docs hosting and supported portal deployments.',
  },
  {
    slug: 'accessibility',
    title: 'Accessibility',
    description: 'Tested behavior, keyboard guidance, and current limits.',
  },
  {
    slug: 'roadmap',
    title: 'Roadmap',
    description: 'Preview scope, release prerequisites, and deferred work.',
  },
  {
    slug: 'contributing',
    title: 'Contributing',
    description: 'Help shape the first useful release.',
  },
] as const

export const searchIndex = docsNavigation.map((item) => ({
  ...item,
  href: item.slug ? `/docs/${item.slug}` : '/docs',
  keywords:
    `${item.title} ${item.description} ${item.slug.replaceAll('-', ' ')}`.toLowerCase(),
}))

export const matchesSearch = (keywords: string, query: string) =>
  query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((term) => keywords.includes(term))

export const canonicalBaseUrl = (
  import.meta.env.VITE_SITE_URL as string | undefined
)?.replace(/\/$/, '')
