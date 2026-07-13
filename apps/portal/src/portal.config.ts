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
    { id: 'open', name: 'Open', order: 0 },
    { id: 'planned', name: 'Planned', order: 1 },
    { id: 'in-progress', name: 'In progress', order: 2 },
    { id: 'complete', name: 'Complete', order: 3 },
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
