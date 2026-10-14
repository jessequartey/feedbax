import { defineFeedbax } from "@feedbax/config";

// prettier-ignore
export default defineFeedbax({
  "product": {
    "name": "Feedbax",
    "description": "Share feedback and follow product progress.",
    "logo": "/feedbax-mark.svg"
  },
  "theme": {
    "preset": "lyra-neutral"
  },
  "notion": {
    "databaseId": "test-database",
    "dataSourceId": "test-feedback",
    "properties": {
      "title": "test-title",
      "slug": "test-slug",
      "description": "test-description",
      "type": "test-type",
      "status": "test-status",
      "published": "test-published",
      "voteCount": "test-voteCount",
      "teamResponse": "test-teamResponse",
      "releaseNotesUrl": "test-releaseNotesUrl",
      "submitterName": "test-submitterName",
      "submitterEmail": "test-submitterEmail",
      "source": "test-source",
      "externalId": "test-externalId",
      "editTokenHash": "test-editTokenHash",
      "createdAt": "test-createdAt",
      "updatedAt": "test-updatedAt"
    }
  },
  "changelog": {
    "databaseId": "test-database",
    "dataSourceId": "test-changelog",
    "properties": {
      "title": "test-title",
      "slug": "test-slug",
      "date": "test-date",
      "summary": "test-summary",
      "body": "test-body",
      "labels": "test-labels",
      "image": "test-image",
      "published": "test-published",
      "createdAt": "test-createdAt",
      "updatedAt": "test-updatedAt"
    }
  },
  "features": {
    "voting": true,
    "comments": true,
    "changelog": true
  },
  "submissions": {
    "moderation": "required",
    "maxTitleLength": 120,
    "maxDescriptionLength": 5000
  },
  "turnstile": {
    "enabled": false
  }
});
