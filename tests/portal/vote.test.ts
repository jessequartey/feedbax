import { describe, expect, it } from "vite-plus/test";

import { optimisticVote, runVote, type VoteState } from "../../src/components/portal/vote.ts";

const start: VoteState = { votes: 5, voted: false };

function recorder() {
  const states: VoteState[] = [];
  return { states, apply: (s: VoteState) => states.push(s) };
}

describe("optimistic voting", () => {
  it("flips the vote and the count", () => {
    expect(optimisticVote(start)).toEqual({ votes: 6, voted: true });
    expect(optimisticVote({ votes: 6, voted: true })).toEqual({ votes: 5, voted: false });
    expect(optimisticVote({ votes: 0, voted: true }).votes).toBe(0);
  });

  it("shows the optimistic state first, then the server's truth", async () => {
    const { states, apply } = recorder();
    const result = await runVote(
      start,
      async (voted) => ({ ok: true, data: { votes: 9, viewerHasVoted: voted } }),
      apply,
    );
    expect(result).toEqual({ ok: true });
    expect(states).toEqual([
      { votes: 6, voted: true },
      { votes: 9, voted: true },
    ]);
  });

  it("rolls back when the server rejects the vote", async () => {
    const { states, apply } = recorder();
    const error = { code: "rate_limited", message: "Slow down" } as const;
    const result = await runVote(start, async () => ({ ok: false, error }), apply);
    expect(result).toEqual({ ok: false, error });
    expect(states).toEqual([{ votes: 6, voted: true }, start]);
  });

  it("rolls back when the request throws", async () => {
    const { states, apply } = recorder();
    const result = await runVote(
      start,
      async () => {
        throw new Error("offline");
      },
      apply,
    );
    expect(result.ok).toBe(false);
    expect(states.at(-1)).toEqual(start);
  });

  it("sends the new desired state, so retries are idempotent", async () => {
    const sent: boolean[] = [];
    await runVote(
      { votes: 1, voted: true },
      async (voted) => {
        sent.push(voted);
        return { ok: true, data: { votes: 0, viewerHasVoted: voted } };
      },
      () => {},
    );
    expect(sent).toEqual([false]);
  });
});
