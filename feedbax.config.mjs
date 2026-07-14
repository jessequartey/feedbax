import { defineConfig } from '@feedbax/config'

export default defineConfig({
  publicUrl: process.env.FEEDBAX_PUBLIC_URL ?? 'https://feedback.feedbax.dev',
  subscriptions: { enabled: false },
  commentRoles: {
    administrator: ['admin', 'administrator'],
    team: ['team', 'staff', 'support'],
  },
  branding: {
    productName: 'Feedbax',
    description: 'Shape what we build next.',
    logo: '/brand/logo.svg',
    favicon: '/favicon.svg',
    socialPreviewImage:
      process.env.FEEDBAX_SOCIAL_PREVIEW_IMAGE ??
      'https://feedback.feedbax.dev/social-preview.png',
    accentColor: '#2563eb',
    themes: {
      light: {
        background: '#f6f7fb',
        surface: '#ffffff',
        text: '#25273d',
        mutedText: '#626a80',
        border: '#d4d7e1',
      },
      dark: {
        background: '#0d111b',
        surface: '#141a26',
        text: '#e8edf7',
        mutedText: '#aeb8ca',
        border: '#3b465c',
      },
    },
    navigation: [
      { label: 'Feedback', href: '/' },
      { label: 'Roadmap', href: '/roadmap' },
      { label: 'Changelog', href: '/changelog' },
    ],
    supportUrl: 'mailto:support@feedbax.dev',
    poweredByFeedbax: true,
  },
  publicTaxonomy: {
    statuses: [
      { id: 'open', name: 'Open', order: 0, isTerminal: false },
      { id: 'planned', name: 'Planned', order: 1, isTerminal: false },
      { id: 'in-progress', name: 'In progress', order: 2, isTerminal: false },
      { id: 'complete', name: 'Complete', order: 3, isTerminal: true },
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
  roadmap: {
    title: 'Product roadmap',
    description: 'Follow what we are considering, building, and shipping.',
    columnStatusIds: ['open', 'planned', 'in-progress', 'complete'],
  },
  changelog: {
    title: 'Product updates',
    description: 'New features, improvements, and fixes from the Feedbax team.',
  },
  ...(process.env.FEEDBAX_AUTH_ISSUERS &&
  process.env.FEEDBAX_AUTH_SESSION_KEYS &&
  process.env.FEEDBAX_AUTH_ACTIVE_SESSION_KEY_ID
    ? {
        authentication: {
          audience: 'feedbax',
          loginUrl:
            process.env.FEEDBAX_AUTH_LOGIN_URL ??
            'https://app.example.com/login',
          issuers: JSON.parse(process.env.FEEDBAX_AUTH_ISSUERS),
          sessionKeys: JSON.parse(process.env.FEEDBAX_AUTH_SESSION_KEYS),
          activeSessionKeyId: process.env.FEEDBAX_AUTH_ACTIVE_SESSION_KEY_ID,
        },
      }
    : {}),
  connector: {
    id: 'notion',
    displayName: 'Notion',
    capabilities: ['comments'],
    ...(process.env.NOTION_DATA_SOURCE_ID
      ? {
          setup: {
            dataSourceId: process.env.NOTION_DATA_SOURCE_ID,
            fields: {
              title: { property: 'Name', type: 'title', writable: true },
              description: {
                property: 'Description',
                type: 'rich_text',
                writable: true,
              },
              feedbackType: {
                property: 'Type',
                type: 'select',
                writable: true,
              },
              status: { property: 'Status', type: 'select', writable: true },
              commentCount: {
                property: 'Comment count',
                type: 'number',
                writable: true,
              },
              optional: {
                category: {
                  property: 'Category',
                  type: 'select',
                  writable: true,
                },
                tags: {
                  property: 'Tags',
                  type: 'multi_select',
                  writable: true,
                },
                voteCount: {
                  property: 'Vote count',
                  type: 'number',
                  writable: true,
                },
              },
            },
            statuses: {
              open: ['Open'],
              planned: ['Planned'],
              'in-progress': ['In progress'],
              complete: ['Complete'],
            },
            feedbackTypes: {
              feature: 'Feature',
              bug: 'Bug',
              improvement: 'Improvement',
              question: 'Question',
            },
            tags: { mobile: 'Mobile', api: 'API', dashboard: 'Dashboard' },
            ...(process.env.NOTION_VOTES_DATA_SOURCE_ID
              ? {
                  votes: {
                    dataSourceId: process.env.NOTION_VOTES_DATA_SOURCE_ID,
                    fields: {
                      key: { property: 'Key', type: 'title', writable: true },
                      feedbackItem: {
                        property: 'Feedback',
                        type: 'relation',
                        writable: true,
                      },
                      voterKey: {
                        property: 'Voter key',
                        type: 'rich_text',
                        writable: true,
                      },
                      active: {
                        property: 'Active',
                        type: 'checkbox',
                        writable: true,
                      },
                    },
                  },
                }
              : {}),
            ...(process.env.NOTION_COMMENTS_DATA_SOURCE_ID
              ? {
                  comments: {
                    dataSourceId: process.env.NOTION_COMMENTS_DATA_SOURCE_ID,
                    fields: {
                      key: { property: 'Key', type: 'title', writable: true },
                      feedbackItem: {
                        property: 'Feedback',
                        type: 'relation',
                        writable: true,
                      },
                      body: {
                        property: 'Body',
                        type: 'rich_text',
                        writable: true,
                      },
                      authorId: {
                        property: 'Author ID',
                        type: 'rich_text',
                        writable: true,
                      },
                      authorName: {
                        property: 'Author name',
                        type: 'rich_text',
                        writable: true,
                      },
                      authorAvatar: {
                        property: 'Author avatar',
                        type: 'url',
                        writable: true,
                      },
                      authorKind: {
                        property: 'Author kind',
                        type: 'select',
                        writable: true,
                      },
                    },
                  },
                }
              : {}),
            ...(process.env.NOTION_CHANGELOG_DATA_SOURCE_ID
              ? {
                  changelog: {
                    dataSourceId: process.env.NOTION_CHANGELOG_DATA_SOURCE_ID,
                    fields: {
                      title: {
                        property: 'Name',
                        type: 'title',
                        writable: true,
                      },
                      description: {
                        property: 'Description',
                        type: 'rich_text',
                        writable: true,
                      },
                      slug: {
                        property: 'Slug',
                        type: 'rich_text',
                        writable: true,
                      },
                      publishedAt: {
                        property: 'Published at',
                        type: 'date',
                        writable: true,
                      },
                      published: {
                        property: 'Published',
                        type: 'checkbox',
                        writable: true,
                      },
                      version: {
                        property: 'Version',
                        type: 'rich_text',
                        writable: true,
                      },
                      tags: {
                        property: 'Tags',
                        type: 'multi_select',
                        writable: true,
                      },
                      coverImageUrl: {
                        property: 'Cover image',
                        type: 'url',
                        writable: true,
                      },
                      linkedFeedbackItemIds: {
                        property: 'Feedback',
                        type: 'relation',
                        writable: true,
                      },
                    },
                  },
                }
              : {}),
          },
        }
      : {}),
  },
})
