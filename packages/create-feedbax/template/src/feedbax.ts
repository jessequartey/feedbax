import { defineFeedbax } from "@feedbax/config";

const env = (name: string) => process.env[name] ?? "not-configured";

export default defineFeedbax({
  product: {
    name: "Feedbax",
    description: "Share feedback and follow product progress.",
    logo: "/feedbax-mark.svg",
    siteUrl: process.env.FEEDBAX_SITE_URL,
  },
  theme: { preset: "lyra-neutral" },
  notion: {
    databaseId: env("NOTION_FEEDBACK_DATABASE_ID"),
    dataSourceId: env("NOTION_FEEDBACK_DATA_SOURCE_ID"),
    properties: {
      title: env("NOTION_FEEDBACK_TITLE_PROPERTY_ID"),
      slug: env("NOTION_FEEDBACK_SLUG_PROPERTY_ID"),
      description: env("NOTION_FEEDBACK_DESCRIPTION_PROPERTY_ID"),
      type: env("NOTION_FEEDBACK_TYPE_PROPERTY_ID"),
      status: env("NOTION_FEEDBACK_STATUS_PROPERTY_ID"),
      published: env("NOTION_FEEDBACK_PUBLISHED_PROPERTY_ID"),
      voteCount: env("NOTION_FEEDBACK_VOTE_COUNT_PROPERTY_ID"),
      teamResponse: env("NOTION_FEEDBACK_TEAM_RESPONSE_PROPERTY_ID"),
      releaseNotesUrl: env("NOTION_FEEDBACK_RELEASE_NOTES_URL_PROPERTY_ID"),
      submitterName: env("NOTION_FEEDBACK_SUBMITTER_NAME_PROPERTY_ID"),
      submitterEmail: env("NOTION_FEEDBACK_SUBMITTER_EMAIL_PROPERTY_ID"),
      source: env("NOTION_FEEDBACK_SOURCE_PROPERTY_ID"),
      externalId: env("NOTION_FEEDBACK_EXTERNAL_ID_PROPERTY_ID"),
      editTokenHash: env("NOTION_FEEDBACK_EDIT_TOKEN_HASH_PROPERTY_ID"),
      createdAt: env("NOTION_FEEDBACK_CREATED_AT_PROPERTY_ID"),
      updatedAt: env("NOTION_FEEDBACK_UPDATED_AT_PROPERTY_ID"),
    },
  },
  changelog: {
    databaseId: env("NOTION_CHANGELOG_DATABASE_ID"),
    dataSourceId: env("NOTION_CHANGELOG_DATA_SOURCE_ID"),
    properties: {
      title: env("NOTION_CHANGELOG_TITLE_PROPERTY_ID"),
      slug: env("NOTION_CHANGELOG_SLUG_PROPERTY_ID"),
      date: env("NOTION_CHANGELOG_DATE_PROPERTY_ID"),
      summary: env("NOTION_CHANGELOG_SUMMARY_PROPERTY_ID"),
      body: env("NOTION_CHANGELOG_BODY_PROPERTY_ID"),
      labels: env("NOTION_CHANGELOG_LABELS_PROPERTY_ID"),
      image: env("NOTION_CHANGELOG_IMAGE_PROPERTY_ID"),
      published: env("NOTION_CHANGELOG_PUBLISHED_PROPERTY_ID"),
      createdAt: env("NOTION_CHANGELOG_CREATED_AT_PROPERTY_ID"),
      updatedAt: env("NOTION_CHANGELOG_UPDATED_AT_PROPERTY_ID"),
    },
  },
  features: {
    voting: process.env.FEEDBAX_VOTING_ENABLED !== "false",
    comments: process.env.FEEDBAX_COMMENTS_ENABLED !== "false",
    changelog: process.env.FEEDBAX_CHANGELOG_ENABLED !== "false",
  },
  submissions: {
    moderation: "required",
    maxTitleLength: 120,
    maxDescriptionLength: 5_000,
  },
  turnstile: {
    enabled: Boolean(process.env.VITE_TURNSTILE_SITE_KEY),
    siteKey: process.env.VITE_TURNSTILE_SITE_KEY,
  },
});
