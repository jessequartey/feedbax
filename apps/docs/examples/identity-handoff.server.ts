import { createHmac, randomBytes } from "node:crypto";

export function createIdentityLoginHandler(options: {
  applicationOrigin: string;
  portalOrigin: string;
  issuer: string;
  secret: string;
  authenticate(request: Request): Promise<{
    subject: string;
    displayName: string;
    email?: string;
    emailVerified?: boolean;
  } | null>;
}) {
  const app = new URL(options.applicationOrigin).origin;
  const portal = new URL(options.portalOrigin).origin;
  if (
    ![app, portal, options.issuer].every(
      (url) => new URL(url).protocol === "https:",
    ) ||
    options.secret.length < 32
  )
    throw new Error(
      "Configure HTTPS origins and a server-only handoff secret of at least 32 characters.",
    );
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (request.method !== "GET")
      return new Response("Method not allowed", { status: 405, headers });
    const state = url.searchParams.get("state");
    const callback = url.searchParams.get("callback");
    if (
      url.origin !== app ||
      !state ||
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      callback !== `${portal}/internal/identity/callback` ||
      url.searchParams.getAll("state").length !== 1 ||
      url.searchParams.getAll("callback").length !== 1
    )
      return new Response("Invalid Feedbax sign-in request", {
        status: 400,
        headers,
      });
    const user = await options.authenticate(request);
    if (!user)
      return new Response(
        "Sign in to your product, then retry Feedbax sign-in.",
        { status: 401, headers },
      );
    if (
      ![user.subject, user.displayName].every(
        (value) =>
          typeof value === "string" &&
          value.trim().length > 0 &&
          value.length <= 512,
      )
    )
      return new Response("Application identity is incomplete", {
        status: 403,
        headers,
      });
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({
        purpose: "feedbax-identity-v1",
        subject: user.subject,
        displayName: user.displayName,
        ...(user.emailVerified === true && user.email
          ? { email: user.email, emailVerified: true }
          : {}),
        issuer: options.issuer,
        audience: portal,
        state,
        nonce: randomBytes(32).toString("base64url"),
        issuedAt: now,
        expiresAt: now + 120,
      }),
    ).toString("base64url");
    const signature = createHmac("sha256", options.secret)
      .update(`feedbax-identity-v1:${payload}`)
      .digest("base64url");
    const nonce = randomBytes(24).toString("base64url");
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Continue to feedback</title><body><form method="post" action="${escapeHtml(callback)}"><input type="hidden" name="token" value="${payload}.${signature}"><button type="submit">Continue to feedback</button></form><script nonce="${nonce}">document.forms[0].requestSubmit()</script></body></html>`;
    return new Response(html, {
      headers: {
        ...headers,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": `default-src 'none'; form-action ${portal}; script-src 'nonce-${nonce}'; frame-ancestors 'none'`,
      },
    });
  };
}
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}
