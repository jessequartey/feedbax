// Same-origin client for Better Auth's REST endpoints under /api/auth/*. Only what the portal
// needs: social redirect, the lazy anonymous session, and sign-out.
//
// Why not `createAuthClient()`? Importing it ships Better Auth's shared env helper, which spells
// out the names of server secrets in the client bundle, and the repo's gate is that
// `grep -r "BETTER_AUTH_SECRET|FEEDBAX_HOST_SECRET" dist/client` finds nothing. The call shapes
// below match Better Auth's client (`{ data, error }`), so swapping it in later is a one-line change.

export type AuthError = { message: string; code?: string; status: number };
export type AuthResult<T = unknown> = { data: T; error: null } | { data: null; error: AuthError };

async function post<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<AuthResult<T>> {
  try {
    const response = await fetch(`/api/auth${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => null)) as {
      message?: unknown;
      code?: unknown;
    } | null;
    if (!response.ok) {
      return {
        data: null,
        error: {
          status: response.status,
          message: typeof json?.message === "string" ? json.message : "",
          code: typeof json?.code === "string" ? json.code : undefined,
        },
      };
    }
    return { data: json as T, error: null };
  } catch {
    return { data: null, error: { status: 0, message: "Couldn't reach the server." } };
  }
}

export const authClient = {
  signIn: {
    /** Anonymous mode only. Called just before the first write. */
    anonymous: () => post("/sign-in/anonymous"),
    social: async (input: { provider: "github" | "google"; callbackURL: string }) => {
      const result = await post<{ url?: string }>("/sign-in/social", input);
      if (result.data?.url) window.location.assign(result.data.url);
      return result;
    },
  },
  signOut: () => post("/sign-out"),
};
