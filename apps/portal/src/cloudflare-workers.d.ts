declare module "cloudflare:workers" {
  export const env: {
    TRUSTED_SUBMISSIONS_RATE_LIMITER: {
      limit(options: { key: string }): Promise<{ success: boolean }>;
    };
    PORTAL_SUBMISSIONS_RATE_LIMITER: {
      limit(options: { key: string }): Promise<{ success: boolean }>;
    };
    TURNSTILE_SECRET_KEY?: string;
  };
}
