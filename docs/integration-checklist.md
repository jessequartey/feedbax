# Integrate Feedbax with your product

Released 0.2.1 supports Notion. This branch's GitHub and My feedback instructions describe 0.2.2 development source; use matching creator/CLI source until that version is published. [Release acceptance](version-0.2.2-acceptance.md) records remaining work.

## Choose the setup path

| Need                                   | Guide                                                                       | Required resources                                                           |
| -------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Notion feedback portal                 | [Notion setup](../apps/docs/content/docs/getting-started/notion.mdx)        | Internal integration and shared parent page/data source                      |
| GitHub feedback portal                 | [GitHub setup](../apps/docs/content/docs/getting-started/github.mdx)        | Feedback Repository, dedicated portal D1, paired App service with its own D1 |
| Submission form inside your product    | [Feedback block](../apps/docs/content/docs/integrations/feedback-block.mdx) | Product server endpoint and trusted submission key                           |
| Feedback from your server              | [Submission API](../apps/docs/content/docs/integrations/submission-api.mdx) | Deployed portal origin, private trusted key, stable idempotency key          |
| Verified participation and My feedback | [Connected authentication](connected-profile.md)                            | Existing product sign-in, signed Identity Handoff, portal D1                 |
| Email or images                        | [Connected capabilities](connected-profile.md)                              | Enabled sender/consent or private R2, plus scheduled processing              |

Select exactly one Content Provider per Installation. GitHub does not require Participant GitHub accounts or a Notion token. Changelog is disabled for GitHub in 0.2.2. Existing Notion Installations do not acquire D1, identity, R2 or email merely by updating source.

## Put credentials in the right place

| Location                                              | Values                                                                                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Product server                                        | Plaintext trusted submission key; Identity Handoff secret only if Connected is enabled                                           |
| Portal ignored `.dev.vars` / encrypted Worker secrets | Provider/bootstrap secrets, trusted-key hash, independent participation signing secret, enabled identity/Turnstile/email secrets |
| Portal private D1                                     | GitHub directional binding credentials and mappings; enabled identity, ownership and participation records                       |
| GitHub integration service                            | App private key/client/webhook credentials and independent service signing secret                                                |
| Browser                                               | Public settings and short-lived, scoped browser/session capabilities; no server secrets                                          |

The submission key authorizes service intake. A supplied name/email does not establish verified ownership. Connected identity comes from the configured issuer and stable signed subject; email equality is never identity evidence.

## Verify before connecting Participants

1. Apply every included migration to the intended database, run `feedbax doctor`, build and perform a deployment dry run. For GitHub, bootstrap deployment and complete pairing before full diagnostics. Local and remote D1 are separate.
2. Submit a disposable Post from your product server. Retry the same event using the same `Idempotency-Key`; confirm the original Post is returned. Posts start New and unpublished.
3. Publish through the selected provider. Verify the public title/body/status and absence of contact details, capability material and engineering notes. For GitHub, use only the approved JSON section, one status label and the separate publication label.
4. Remove publication. Check that the Post, Comments and images become unavailable. On GitHub, public repositories still expose their issue content directly; choose private repositories for confidential intake.
5. If Connected is enabled, test two accounts and two browsers. Check private My feedback/Notifications, eligible draft editing, sign-out clearing, unique Votes and opt-outs. Browser draft linking requires both its existing capability and verified identity.
6. If enabled, verify real email delivery/consent and private image authorization. Build success and local tests alone do not establish production authentication, sender delivery or storage privacy.

Keep a protected record of deployment configuration and credentials. Use [troubleshooting](../apps/docs/content/docs/operations/troubleshooting.mdx) for pairing, publication and retry failures. No new Team Member login, moderation command or manual recovery tool is introduced in this scope; Deployer lifecycle tooling remains separately tracked.
