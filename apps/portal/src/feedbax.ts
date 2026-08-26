import { defineFeedbax } from "@feedbax/config";

export default defineFeedbax({
  features: {
    voting: true,
    comments: true,
    changelog: true,
  },
  changelog: {
    databaseId: process.env.NOTION_CHANGELOG_DATABASE_ID ?? "not-configured",
    dataSourceId:
      process.env.NOTION_CHANGELOG_DATA_SOURCE_ID ?? "not-configured",
    propertyIds: {
      title: process.env.NOTION_CHANGELOG_TITLE_PROPERTY_ID ?? "not-configured",
      slug: process.env.NOTION_CHANGELOG_SLUG_PROPERTY_ID ?? "not-configured",
      date: process.env.NOTION_CHANGELOG_DATE_PROPERTY_ID ?? "not-configured",
      summary:
        process.env.NOTION_CHANGELOG_SUMMARY_PROPERTY_ID ?? "not-configured",
      body: process.env.NOTION_CHANGELOG_BODY_PROPERTY_ID ?? "not-configured",
      labels:
        process.env.NOTION_CHANGELOG_LABELS_PROPERTY_ID ?? "not-configured",
      image: process.env.NOTION_CHANGELOG_IMAGE_PROPERTY_ID ?? "not-configured",
      published:
        process.env.NOTION_CHANGELOG_PUBLISHED_PROPERTY_ID ?? "not-configured",
      createdAt:
        process.env.NOTION_CHANGELOG_CREATED_AT_PROPERTY_ID ?? "not-configured",
      updatedAt:
        process.env.NOTION_CHANGELOG_UPDATED_AT_PROPERTY_ID ?? "not-configured",
    },
  },
});
