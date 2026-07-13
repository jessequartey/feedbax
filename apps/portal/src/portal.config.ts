import type { PortalBranding } from './components/portal-shell.js'

// Public presentation values live in configuration, never in product components.
export const portalBranding: PortalBranding = {
  name: 'Feedbax',
  tagline: 'Shape what we build next.',
  mark: 'F',
  accent: '#2563eb',
  supportUrl: 'mailto:support@feedbax.dev',
}

export const portalPublicConfig = {
  publicUrl: 'https://feedback.feedbax.dev',
  socialPreviewImage: 'https://feedback.feedbax.dev/social-preview.png',
  subscriptions: { enabled: false },
  commentRoles: { administrator: ['admin', 'administrator'], team: ['team', 'staff', 'support'] },
} as const

export const publicTaxonomy = {
  statuses: [
    { id: 'open', name: 'Open', order: 0, color: '#64748b', isTerminal: false },
    { id: 'planned', name: 'Planned', order: 1, color: '#8b5cf6', isTerminal: false },
    { id: 'in-progress', name: 'In progress', order: 2, color: '#2563eb', isTerminal: false },
    { id: 'complete', name: 'Complete', order: 3, color: '#16a34a', isTerminal: true },
  ],
  categories: [
    { id: 'feature', name: 'Feature', order: 0 },
    { id: 'improvement', name: 'Improvement', order: 1 },
    { id: 'integration', name: 'Integration', order: 2 },
  ],
  tags: [
    { id: 'mobile', name: 'Mobile', order: 0 },
    { id: 'api', name: 'API', order: 1 },
    { id: 'dashboard', name: 'Dashboard', order: 2 },
  ],
} as const

export const publicRoadmap = {
  title: 'Product roadmap',
  description: 'Follow what we are considering, building, and shipping.',
  columnStatusIds: ['open', 'planned', 'in-progress', 'complete'],
} as const

// Canonical public IDs map to Notion workflow values. Unmapped values stay private.
export const notionStatusMappings = {
  open: ['Open'],
  planned: ['Planned'],
  'in-progress': ['In progress'],
  complete: ['Complete'],
} as const
