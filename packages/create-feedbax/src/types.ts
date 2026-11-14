import type { GitHubSetupClient, NotionSetupClient } from "../../../src/contracts/integrations.ts";
export type PackageManager = "npm" | "pnpm" | "bun";
export type SetupAnswers = {
  name: string;
  template: "notion" | "notion-github";
  anonymous: boolean;
  packageManager: PackageManager;
  notionDataSourceId: string;
  githubRepo?: string;
};
export type Secrets = {
  notionToken: string;
  githubToken?: string;
  cloudflareApiToken?: string;
  cloudflareAccountId?: string;
};
export type Run = (
  cmd: string,
  args: string[],
  opts: { cwd: string; env?: Record<string, string>; stdin?: string },
) => Promise<{ code: number; stdout: string; stderr: string }>;
export type Choice = { value: string; label: string; hint?: string };
export type Prompter = {
  intro(message: string): void;
  note(message: string, title?: string): void;
  info(message: string): void;
  error(message: string): void;
  outro(message: string): void;
  text(
    message: string,
    options?: {
      defaultValue?: string;
      secret?: boolean;
      validate?: (value: string) => string | undefined;
    },
  ): Promise<string>;
  select(message: string, options: Choice[], initialValue?: string): Promise<string>;
  confirm(message: string, initialValue?: boolean): Promise<boolean>;
  step<T>(message: string, action: () => Promise<T>): Promise<T>;
};
export type Clients = {
  notion(token: string, fetch?: typeof globalThis.fetch): NotionSetupClient;
  github(token: string, fetch?: typeof globalThis.fetch): GitHubSetupClient;
};
