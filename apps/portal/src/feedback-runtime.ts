import {
  createFeedbackModule,
  createNotionFeedbackModule,
} from "@feedbax/feedback";
import { cache } from "cloudflare:workers";

import {
  createInvalidatingFeedbackModule,
  createPublicCacheInvalidator,
} from "./feedback-cache-invalidation";

export const feedbackSubmissionLimits = {
  maxTitleLength: 160,
  maxDescriptionLength: 5_000,
} as const;

export function createConfiguredFeedbackModule() {
  if (import.meta.env.MODE === "demo") return demoFeedbackModule();
  const feedback = createNotionFeedbackModule({
    token: requiredEnvironmentValue("NOTION_TOKEN"),
    dataSourceId: requiredEnvironmentValue("NOTION_FEEDBACK_DATA_SOURCE_ID"),
    propertyIds: {
      title: requiredEnvironmentValue("NOTION_FEEDBACK_TITLE_PROPERTY_ID"),
      slug: requiredEnvironmentValue("NOTION_FEEDBACK_SLUG_PROPERTY_ID"),
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
  return createInvalidatingFeedbackModule({
    feedback,
    invalidator: createPublicCacheInvalidator({
      purge: (options) => cache.purge(options),
    }),
  });
}

let demoFeedback: ReturnType<typeof createFeedbackModule> | undefined;

function demoFeedbackModule() {
  demoFeedback ??= createFeedbackModule({
    initialItems: [
      demoPost(
        "keyboard-first-search",
        "Keyboard-first search",
        "Open search without reaching for the mouse.",
        "Feature Request",
        "Planned",
        42,
      ),
      demoPost(
        "public-api-access",
        "Public API access",
        "Connect product feedback to internal tools.",
        "Feature Request",
        "Planned",
        31,
      ),
      demoPost(
        "improve-mobile-navigation",
        "Improve mobile navigation",
        "Make boards easier to browse on smaller screens.",
        "Bug Report",
        "In Progress",
        18,
      ),
      demoPost(
        "weekly-digest-emails",
        "Weekly digest emails",
        "A short summary of new Posts and status changes.",
        "General Feedback",
        "In Progress",
        12,
      ),
      demoPost(
        "dark-mode",
        "Dark mode",
        "A comfortable theme for low light.",
        "Feature Request",
        "Shipped",
        67,
      ),
    ],
  });
  return demoFeedback;
}

function demoPost(
  slug: string,
  title: string,
  description: string,
  type: "Feature Request" | "Bug Report" | "General Feedback",
  status: "Planned" | "In Progress" | "Shipped",
  day: number,
) {
  const date = new Date(Date.UTC(2026, 6, Math.min(day, 28)));
  return {
    id: `demo-${slug}`,
    slug,
    title,
    description,
    type,
    status,
    published: true,
    createdAt: date,
    updatedAt: date,
  };
}

export function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("Feedback configuration is missing.");
  return value;
}
