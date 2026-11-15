import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

type Run = {
  id: number;
  name: string;
  head_sha: string;
  head_branch: string;
  event: string;
  status: string;
  conclusion: string | null;
};
type Response = {
  status?: string;
  workflow_runs?: Run[];
  jobs?: { name: string; head_sha: string; status: string; conclusion: string | null }[];
};

/** Fail closed unless the exact tagged commit has passed main's CI and Verify Core. */
export async function requireReleaseCI({
  repo,
  sha,
  api,
  now = Date.now,
  sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  timeoutMs = 20 * 60 * 1000,
  pollMs = 15_000,
  graceMs = 2 * 60 * 1000,
}: {
  repo: string;
  sha: string;
  api: (path: string) => Promise<Response>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  pollMs?: number;
  /** How long to wait for GitHub to register main's CI run before giving up. */
  graceMs?: number;
}) {
  const base = `repos/${repo}`;
  // Comparing main as base means the tag must be identical to or behind main.
  const comparison = await api(`${base}/compare/main...${sha}`);
  if (!["identical", "behind"].includes(comparison.status ?? "")) {
    throw new Error(`Release blocked: tagged commit ${sha} is not on main.`);
  }

  const start = now();
  const deadline = start + timeoutMs;
  const graceDeadline = Math.min(deadline, start + graceMs);
  while (true) {
    const response = await api(
      `${base}/actions/workflows/ci.yml/runs?head_sha=${sha}&branch=main&event=push&per_page=100`,
    );
    // Prefer the newest run: an older successful run must not hide a failed rerun.
    const run = response.workflow_runs
      ?.filter(
        (run) =>
          run.name === "CI" &&
          run.head_sha === sha &&
          run.head_branch === "main" &&
          run.event === "push",
      )
      .sort((a, b) => b.id - a.id)[0];
    if (!run) {
      // A tag pushed with main can reach this job before GitHub registers main's CI run.
      if (now() >= graceDeadline) {
        throw new Error(`Release blocked: CI never ran on main for tagged commit ${sha}.`);
      }
      console.log(`Waiting for main CI for ${sha} to start...`);
      await sleep(Math.min(pollMs, graceDeadline - now()));
      continue;
    }
    if (run.status === "completed") {
      if (run.conclusion !== "success") {
        throw new Error(`Release blocked: CI for ${sha} concluded ${run.conclusion}.`);
      }
      // filter=latest excludes jobs from previous attempts of this workflow run.
      const result = await api(`${base}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
      const job = result.jobs?.find((job) => job.name === "Verify Core");
      if (job?.head_sha !== sha || job.status !== "completed" || job.conclusion !== "success") {
        throw new Error(`Release blocked: Verify Core did not succeed for ${sha}.`);
      }
      console.log(`Release gate passed: main CI and Verify Core succeeded for ${sha}.`);
      return;
    }
    if (now() >= deadline) {
      throw new Error(`Release blocked: timed out waiting for CI for ${sha} after ${timeoutMs}ms.`);
    }
    console.log(`Waiting for main CI for ${sha} (${run.status})...`);
    await sleep(Math.min(pollMs, deadline - now()));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error("GITHUB_REPOSITORY is required.");
  // HEAD resolves annotated tags too, including workflow_dispatch retries.
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  await requireReleaseCI({
    repo,
    sha,
    api: async (path) =>
      JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8", timeout: 30_000 })),
  });
}
