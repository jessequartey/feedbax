import { createNotionFeedbackModule } from "@feedbax/feedback";

export const feedbackSubmissionLimits = {
  maxTitleLength: 160,
  maxDescriptionLength: 5_000,
} as const;

export function createConfiguredFeedbackModule() {
  return createNotionFeedbackModule({
    token: requiredEnvironmentValue("NOTION_TOKEN"),
    dataSourceId: requiredEnvironmentValue("NOTION_FEEDBACK_DATA_SOURCE_ID"),
    propertyIds: {
      title: requiredEnvironmentValue("NOTION_FEEDBACK_TITLE_PROPERTY_ID"),
      description: requiredEnvironmentValue(
        "NOTION_FEEDBACK_DESCRIPTION_PROPERTY_ID",
      ),
      type: requiredEnvironmentValue("NOTION_FEEDBACK_TYPE_PROPERTY_ID"),
      status: requiredEnvironmentValue("NOTION_FEEDBACK_STATUS_PROPERTY_ID"),
      published: requiredEnvironmentValue(
        "NOTION_FEEDBACK_PUBLISHED_PROPERTY_ID",
      ),
      submitterName: requiredEnvironmentValue(
        "NOTION_FEEDBACK_SUBMITTER_NAME_PROPERTY_ID",
      ),
      submitterEmail: requiredEnvironmentValue(
        "NOTION_FEEDBACK_SUBMITTER_EMAIL_PROPERTY_ID",
      ),
      source: requiredEnvironmentValue("NOTION_FEEDBACK_SOURCE_PROPERTY_ID"),
      externalId: requiredEnvironmentValue(
        "NOTION_FEEDBACK_EXTERNAL_ID_PROPERTY_ID",
      ),
      editTokenHash: requiredEnvironmentValue(
        "NOTION_FEEDBACK_EDIT_TOKEN_HASH_PROPERTY_ID",
      ),
      createdAt: requiredEnvironmentValue(
        "NOTION_FEEDBACK_CREATED_AT_PROPERTY_ID",
      ),
      updatedAt: requiredEnvironmentValue(
        "NOTION_FEEDBACK_UPDATED_AT_PROPERTY_ID",
      ),
    },
  });
}

export function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("Feedback configuration is missing.");
  return value;
}
