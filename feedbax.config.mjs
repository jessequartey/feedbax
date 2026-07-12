export default {
  name: 'Feedbax',
  branding: {
    tagline: 'Shape what we build next.',
    mark: 'F',
    accent: '#2563eb',
    supportUrl: 'mailto:support@feedbax.dev',
  },
  publicTaxonomy: {
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
  },
  authentication: {
    audience: 'feedbax',
    loginUrl:
      process.env.FEEDBAX_AUTH_LOGIN_URL ?? 'https://app.example.com/login',
    issuers: JSON.parse(process.env.FEEDBAX_AUTH_ISSUERS ?? '[]'),
    sessionKeys: JSON.parse(process.env.FEEDBAX_AUTH_SESSION_KEYS ?? '[]'),
    activeSessionKeyId: process.env.FEEDBAX_AUTH_ACTIVE_SESSION_KEY_ID ?? '',
  },
  connector: {
    setup: {
      dataSourceId: process.env.NOTION_DATA_SOURCE_ID ?? '',
      fields: {
        title: { property: 'Name', type: 'title', writable: true },
        description: {
          property: 'Description',
          type: 'rich_text',
          writable: true,
        },
        feedbackType: { property: 'Type', type: 'select', writable: true },
        status: { property: 'Status', type: 'status', writable: true },
        commentCount: {
          property: 'Comment count',
          type: 'number',
          writable: true,
        },
        optional: {
          category: { property: 'Category', type: 'select', writable: true },
          tags: { property: 'Tags', type: 'multi_select', writable: true },
          voteCount: { property: 'Vote count', type: 'number', writable: false },
        },
      },
      statuses: {
        open: 'Open',
        planned: 'Planned',
        inProgress: 'In progress',
        complete: 'Complete',
        closed: 'Closed',
      },
      feedbackTypes: {
        feature: 'Feature',
        bug: 'Bug',
        improvement: 'Improvement',
        question: 'Question',
      },
      tags: { mobile: 'Mobile', api: 'API', dashboard: 'Dashboard' },
    },
  },
}
