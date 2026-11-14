// Better Auth React client. Same origin, so no baseURL: it talks to /api/auth/*.
import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({ plugins: [anonymousClient()] });
