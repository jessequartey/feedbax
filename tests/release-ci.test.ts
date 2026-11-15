import { describe, expect, it, vi } from "vite-plus/test";
import { requireReleaseCI } from "../scripts/require-release-ci";

const sha = "abc123";
const run = {
  id: 42,
  name: "CI",
  head_sha: sha,
  head_branch: "main",
  event: "push",
  status: "completed",
  conclusion: "success",
};
const job = { name: "Verify Core", head_sha: sha, status: "completed", conclusion: "success" };
function setup() {
  const api = vi.fn().mockResolvedValueOnce({ status: "behind" });
  return { api, options: { repo: "owner/repo", sha, api } };
}

describe("release CI gate", () => {
  it("accepts an exact SHA on main with successful CI and Verify Core", async () => {
    const { api, options } = setup();
    api.mockResolvedValueOnce({ workflow_runs: [run] }).mockResolvedValueOnce({ jobs: [job] });
    await requireReleaseCI(options);
    expect(api.mock.calls.map(([path]) => path)).toEqual([
      "repos/owner/repo/compare/main...abc123",
      "repos/owner/repo/actions/workflows/ci.yml/runs?head_sha=abc123&branch=main&event=push&per_page=100",
      "repos/owner/repo/actions/runs/42/jobs?filter=latest&per_page=100",
    ]);
  });
  it.each(["ahead", "diverged"])("rejects a tag %s of main", async (status) => {
    const api = vi.fn().mockResolvedValue({ status });
    await expect(requireReleaseCI({ repo: "owner/repo", sha, api })).rejects.toThrow("not on main");
    expect(api).toHaveBeenCalledTimes(1);
  });
  it.each(
    [
      [],
      [{ ...run, head_sha: "other" }],
      [{ ...run, head_branch: "feature" }],
      [{ ...run, event: "pull_request" }],
      [{ ...run, name: "Other" }],
    ].map((runs) => ({ runs })),
  )("rejects missing or unrelated CI runs: %j", async ({ runs }) => {
    const { api, options } = setup();
    api.mockResolvedValueOnce({ workflow_runs: runs });
    await expect(requireReleaseCI({ ...options, graceMs: 0 })).rejects.toThrow("never ran");
  });
  it("waits briefly for main CI to be registered", async () => {
    const { api, options } = setup();
    let clock = 0;
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });
    api
      .mockResolvedValueOnce({ workflow_runs: [] })
      .mockResolvedValueOnce({ workflow_runs: [run] })
      .mockResolvedValueOnce({ jobs: [job] });
    await requireReleaseCI({ ...options, now: () => clock, sleep });
    expect(sleep).toHaveBeenCalledTimes(1);
  });
  it("gives up when main CI never appears within the grace period", async () => {
    const { api, options } = setup();
    let clock = 0;
    const sleep = async (ms: number) => {
      clock += ms;
    };
    api.mockResolvedValue({ workflow_runs: [] });
    await expect(
      requireReleaseCI({ ...options, now: () => clock, sleep, graceMs: 60_000 }),
    ).rejects.toThrow("never ran");
    expect(clock).toBe(60_000);
  });
  it.each(["failure", "cancelled", "timed_out", "skipped"])("rejects CI %s", async (conclusion) => {
    const { api, options } = setup();
    api.mockResolvedValueOnce({ workflow_runs: [run, { ...run, id: 43, conclusion }] });
    await expect(requireReleaseCI(options)).rejects.toThrow(`concluded ${conclusion}`);
  });
  it.each(
    [
      [],
      [{ ...job, conclusion: "skipped" }],
      [{ ...job, head_sha: "other" }],
      [{ ...job, status: "in_progress" }],
    ].map((jobs) => ({ jobs })),
  )("rejects missing or unsuccessful Verify Core: %j", async ({ jobs }) => {
    const { api, options } = setup();
    api.mockResolvedValueOnce({ workflow_runs: [run] }).mockResolvedValueOnce({ jobs });
    await expect(requireReleaseCI(options)).rejects.toThrow("Verify Core did not succeed");
  });
  it("polls running CI until success", async () => {
    const { api, options } = setup();
    api
      .mockResolvedValueOnce({
        workflow_runs: [{ ...run, status: "in_progress", conclusion: null }],
      })
      .mockResolvedValueOnce({ workflow_runs: [run] })
      .mockResolvedValueOnce({ jobs: [job] });
    const sleep = vi.fn().mockResolvedValue(undefined);
    await requireReleaseCI({ ...options, sleep });
    expect(sleep).toHaveBeenCalledWith(15_000);
  });
  it("stops polling at the deadline", async () => {
    const { api, options } = setup();
    api.mockResolvedValue({ workflow_runs: [{ ...run, status: "queued", conclusion: null }] });
    let time = 0;
    const sleep = vi.fn(async (ms: number) => {
      time += ms;
    });
    await expect(
      requireReleaseCI({ ...options, now: () => time, sleep, timeoutMs: 20, pollMs: 15 }),
    ).rejects.toThrow("timed out");
    expect(sleep.mock.calls).toEqual([[15], [5]]);
  });
  it("fails closed on API errors", async () => {
    const { api, options } = setup();
    api.mockRejectedValueOnce(new Error("API denied"));
    await expect(requireReleaseCI(options)).rejects.toThrow("API denied");
  });
});
