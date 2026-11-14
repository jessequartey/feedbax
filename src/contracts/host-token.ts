export type HostUser = { id: string; name: string }; // id → sub, 1–200 chars, no newline; name 1–80
export type HostTokenClaims = { sub: string; name: string; exp: number; jti: string };
export type MintOptions = { secret: string; user: HostUser; now?: number; jti?: string }; // now: epoch s; tests only
export type TokenResult = { token: string };
export const HOST_TOKEN_TTL_SECONDS = 300;
export const HOST_TOKEN_HEADER = '{"alg":"HS256","typ":"JWT"}';
