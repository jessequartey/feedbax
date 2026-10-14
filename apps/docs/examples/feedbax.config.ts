import { defineFeedbax } from "@feedbax/config";

export default defineFeedbax({
  product: {
    name: "Acme Feedback",
    description: "Share feedback and follow product progress.",
    logo: "/logo.svg",
    siteUrl: "https://feedback.feedbax.dev",
  },
  theme: { preset: "lyra-neutral" },
  notion: {
    databaseId: "00000000000000000000000000000000",
    dataSourceId: "00000000000000000000000000000000",
    properties: {
      title: "title",
      slug: "slug",
      description: "description",
      type: "type",
      status: "status",
      published: "published",
      voteCount: "votes",
      teamResponse: "team-response",
      releaseNotesUrl: "release-notes-url",
      submitterName: "submitter-name",
      submitterEmail: "submitter-email",
      source: "source",
      externalId: "external-id",
      editTokenHash: "edit-token-hash",
      createdAt: "created-at",
      updatedAt: "updated-at",
    },
  },
  features: { voting: true, comments: true, changelog: true },
  submissions: {
    moderation: "required",
    maxTitleLength: 120,
    maxDescriptionLength: 5000,
  },
  turnstile: { enabled: false },
});
