---
status: accepted
---

# Add Connected following, notifications, and images

Amended by [ADR-0034](0034-select-one-authoritative-content-provider.md) for 0.2.2: the selected Content Provider owns content, while this decision's identity, consent, delivery and private attachment guarantees remain unchanged.

The owner expanded 0.2.1 to include explicit per-Post following, private in-app and email notifications, and image-only attachments on Posts and Comments. This supersedes the narrower release boundary in ADR-0029; it preserves that decision's signed application identity, D1 ownership of operational state, and Notion ownership of content and moderation.

Follows never imply Votes. Notifications cover subsequent status changes and new Comments, including changes made directly in Notion. A bounded scheduled synchronization observes followed Posts and persists deduplicated events and delivery work in D1. Email is opt-in and requires a contact email asserted as verified by the trusted application; an unverified Device Profile never supplies a delivery address. Cloudflare Email Service and Resend are built-in senders. A custom HTTPS delivery endpoint uses the same bounded message contract and an encrypted bearer secret. Delivery is retried, with provider-specific deduplication limits documented rather than an exactly-once promise.

Image Attachments use a private R2 bucket, authenticated bounded uploads, and D1 association records. Only JPEG, PNG, and WebP are accepted, at most four images per Post or Comment and five MiB per image. The application checks content visibility on every download; bucket objects have no public URL. Draft uploads expire and are cleaned up. Image Attachments do not turn private Notion page bodies into public content.

Notion-only Installations retain their existing footprint. Connected social features and image storage are explicitly configured, and setup, diagnostics, generated apps, documentation, and acceptance checks travel with the feature implementation.
