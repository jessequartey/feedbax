declare module "cloudflare:workers" {
  export const env: {
    DOCS_AUTH_DB?: import("@cloudflare/workers-types").D1Database;
    DOCS_SITE_URL?: string;
    FEEDBAX_PORTAL_ORIGIN?: string;
    DOCS_AUTH_SECRET?: string;
    IDENTITY_HANDOFF_SECRET?: string;
    RESEND_API_KEY?: string;
    AUTH_EMAIL_FROM?: string;
  };
}
