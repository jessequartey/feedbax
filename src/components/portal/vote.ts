// Optimistic voting. `apply` receives the state to show; on any failure it is rolled back.
import type { ApiError, ApiResult, VoteResult } from "@/contracts/domain";

export type VoteState = { votes: number; voted: boolean };

export function optimisticVote(state: VoteState): VoteState {
  return state.voted
    ? { votes: Math.max(0, state.votes - 1), voted: false }
    : { votes: state.votes + 1, voted: true };
}

export async function runVote(
  current: VoteState,
  call: (voted: boolean) => Promise<ApiResult<VoteResult>>,
  apply: (state: VoteState) => void,
): Promise<{ ok: true } | { ok: false; error: ApiError }> {
  const next = optimisticVote(current);
  apply(next);
  let result: ApiResult<VoteResult>;
  try {
    result = await call(next.voted);
  } catch {
    apply(current);
    return { ok: false, error: { code: "unavailable", message: "Couldn't reach the server." } };
  }
  if (!result.ok) {
    apply(current);
    return { ok: false, error: result.error };
  }
  apply({ votes: result.data.votes, voted: result.data.viewerHasVoted });
  return { ok: true };
}
