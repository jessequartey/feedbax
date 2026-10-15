declare module "cloudflare:workers" {
  export const cache: {
    purge(options: { tags: string[] }): Promise<{
      success: boolean;
      errors: Array<{ code: number; message: string }>;
    }>;
  };
  export const env: {
    FEEDBAX_DB?: import("@feedbax/feedback").ConnectedDatabase;
    IDENTITY_HANDOFF_SECRET?: string;
    TRUSTED_SUBMISSIONS_RATE_LIMITER: {
      limit(options: { key: string }): Promise<{ success: boolean }>;
    };
    PORTAL_SUBMISSIONS_RATE_LIMITER: {
      limit(options: { key: string }): Promise<{ success: boolean }>;
    };
    TURNSTILE_SECRET_KEY?: string;
    PARTICIPATION_SIGNING_SECRET?: string;
  };
}
