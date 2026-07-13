export const githubUrl = 'https://github.com/jessequartey/feedbax'

export const statusLabels = [
  'Available',
  'Foundation only',
  'Planned for v0.0.2',
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
    description: 'The planned installation path and current prerequisites.',
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
    description: 'Prepare the only connector targeted for v0.0.2.',
  },
  {
    slug: 'deployment',
    title: 'Deployment',
    description: 'Static site hosting and portal runtime evidence.',
  },
  {
    slug: 'accessibility',
    title: 'Accessibility',
    description: 'Tested behavior, keyboard guidance, and current limits.',
  },
  {
    slug: 'roadmap',
    title: 'Roadmap',
    description: 'Shipped foundations, planned work, and deferred scope.',
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
