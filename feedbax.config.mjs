export default {
  name: 'Feedbax',
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
        status: { property: 'Status', type: 'status', writable: true },
        commentCount: {
          property: 'Comment count',
          type: 'number',
          writable: true,
        },
      },
      statuses: {
        open: 'Open',
        planned: 'Planned',
        inProgress: 'In progress',
        complete: 'Complete',
        closed: 'Closed',
      },
    },
  },
}
