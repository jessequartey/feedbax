import type { Category } from "./domain.ts";
export type FeedbaxConfigInput = {
  name?: string;
  appUrl?: string;
  auth?: { anonymous?: boolean };
  showcase?: boolean;
  /** Opt-in add-ons (`npx feedbax add email`). The Resend key is the RESEND_API_KEY secret. */
  notifications?: { email?: false | { from: string } };
  integrations: { notion: { dataSourceId: string }; github?: false | { repo: string } };
};
export type FeedbaxConfig = {
  name: string;
  appUrl: string | null;
  auth: { anonymous: boolean };
  showcase: boolean;
  notifications: { email: false | { from: string } };
  integrations: { notion: { dataSourceId: string }; github: false | { repo: string } };
};
export type PublicConfig = {
  name: string;
  appUrl: string | null;
  anonymous: boolean;
  /** Categories offered for new posts and in the filters, in display order. */
  categories: Category[];
  oauth: { github: boolean; google: boolean };
  hostLogin: boolean;
  showcase: boolean;
  /** Email notifications are set up (from-address and Resend key): /notifications is offered. */
  email: boolean;
};

const NOTION_ID =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i;
const GITHUB_REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const EMAIL_ADDRESS =
  /^[^\s@<>"(),;:]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/**
 * A sender for notification email: `feedback@example.com` or
 * `Acme Feedback <feedback@example.com>`. Returns a problem, or null when valid.
 */
export function emailFromProblem(value: string): string | null {
  if (value.length > 200 || /[\r\n]/.test(value))
    return "must be one line of at most 200 characters";
  const named = /^([^<>"]{1,80}?)\s*<([^<>]+)>$/.exec(value);
  const address = named ? named[2]! : value;
  if (!EMAIL_ADDRESS.test(address))
    return "must be an email address, optionally with a name: Name <feedback@example.com>";
  return null;
}

function appUrlProblem(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "must be an absolute URL";
  }
  if (url.username || url.password) return "must not contain credentials";
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname)) return null;
  return "must be an https:// URL (http:// is allowed only for localhost)";
}

/**
 * Applies defaults and validates `feedbax.config.ts`. Throws one error that
 * names every invalid field. Messages never echo the configured values.
 */
export function defineConfig(input: FeedbaxConfigInput): FeedbaxConfig {
  const problems: string[] = [];
  const raw: unknown = input;
  const root = isRecord(raw) ? raw : {};

  let name = "Feedbax";
  if (root.name !== undefined) {
    if (typeof root.name !== "string" || root.name.length < 1 || root.name.length > 60) {
      problems.push("name: must be a string of 1–60 characters");
    } else {
      name = root.name;
    }
  }

  let appUrl: string | null = null;
  if (root.appUrl !== undefined) {
    if (typeof root.appUrl !== "string") {
      problems.push("appUrl: must be a string");
    } else {
      const problem = appUrlProblem(root.appUrl);
      if (problem) problems.push(`appUrl: ${problem}`);
      else appUrl = root.appUrl;
    }
  }

  let anonymous = false;
  if (root.auth !== undefined) {
    if (!isRecord(root.auth)) {
      problems.push("auth: must be an object");
    } else if (root.auth.anonymous !== undefined) {
      if (typeof root.auth.anonymous !== "boolean") {
        problems.push("auth.anonymous: must be true or false");
      } else {
        anonymous = root.auth.anonymous;
      }
    }
  }

  let showcase = false;
  if (root.showcase !== undefined) {
    if (typeof root.showcase !== "boolean") {
      problems.push("showcase: must be true or false");
    } else {
      showcase = root.showcase;
    }
  }

  let email: false | { from: string } = false;
  if (root.notifications !== undefined) {
    const notifications = root.notifications;
    if (!isRecord(notifications)) {
      problems.push("notifications: must be an object");
    } else if (notifications.email !== undefined && notifications.email !== false) {
      const value = notifications.email;
      if (!isRecord(value) || typeof value.from !== "string") {
        problems.push(
          "notifications.email: must be false or { from: 'Name <feedback@example.com>' }",
        );
      } else {
        const problem = emailFromProblem(value.from);
        if (problem) problems.push(`notifications.email.from: ${problem}`);
        else email = { from: value.from };
      }
    }
  }

  let dataSourceId = "";
  let github: false | { repo: string } = false;
  const integrations = root.integrations;
  if (!isRecord(integrations)) {
    problems.push("integrations: required");
  } else {
    const notion = integrations.notion;
    if (!isRecord(notion) || typeof notion.dataSourceId !== "string") {
      problems.push("integrations.notion.dataSourceId: required");
    } else if (!NOTION_ID.test(notion.dataSourceId)) {
      problems.push("integrations.notion.dataSourceId: must be a Notion data source ID (UUID)");
    } else {
      dataSourceId = notion.dataSourceId;
    }

    const gh = integrations.github;
    if (gh !== undefined && gh !== false) {
      if (!isRecord(gh) || typeof gh.repo !== "string") {
        problems.push("integrations.github: must be false or { repo: 'owner/repo' }");
      } else if (!GITHUB_REPO.test(gh.repo)) {
        problems.push("integrations.github.repo: must be exactly owner/repo, not a URL");
      } else {
        github = { repo: gh.repo };
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid feedbax.config.ts:\n- ${problems.join("\n- ")}`);
  }
  return {
    name,
    appUrl,
    auth: { anonymous },
    showcase,
    notifications: { email },
    integrations: { notion: { dataSourceId }, github },
  };
}
