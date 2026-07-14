import { defineConfig } from '@feedbax/core'
export default defineConfig({
  branding: {
    name: 'My Feedback',
    description: 'Help us decide what to build next',
  },
  features: { comments: true, roadmap: true, changelog: true },
  statuses: [
    { id: 'new', label: 'New' },
    { id: 'planned', label: 'Planned' },
    { id: 'shipped', label: 'Shipped', terminal: true },
  ],
})
