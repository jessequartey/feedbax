export interface TurnstileVerifier {
  verify(options: { token: string; remoteIp?: string }): Promise<boolean>;
}

export function createCloudflareTurnstileVerifier({
  secretKey,
  request = fetch,
}: {
  secretKey: string;
  request?: typeof fetch;
}): TurnstileVerifier {
  return {
    async verify({ token, remoteIp }) {
      try {
        const body = new URLSearchParams({
          secret: secretKey,
          response: token,
          ...(remoteIp ? { remoteip: remoteIp } : {}),
        });
        const response = await request(
          "https://challenges.cloudflare.com/turnstile/v0/siteverify",
          { method: "POST", body },
        );
        const result = (await response.json()) as { success?: unknown };
        return response.ok && result.success === true;
      } catch {
        return false;
      }
    },
  };
}
