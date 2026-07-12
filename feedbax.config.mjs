export default {
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
