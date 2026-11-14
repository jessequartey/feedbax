import * as React from "react";
import { ArrowUpIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { setVote } from "@/server/functions";
import { runVote, type VoteState } from "./vote";
import { useWriteGate } from "./viewer";

type Props = {
  postId: string;
  postTitle: string;
  votes: number;
  voted: boolean;
  /** `rail` is the tall box on board rows, `inline` is the compact roadmap/detail version. */
  variant?: "rail" | "inline";
  className?: string;
};

export function VoteButton({
  postId,
  postTitle,
  votes,
  voted,
  variant = "rail",
  className,
}: Props) {
  const { ensureWriter, reportError } = useWriteGate();
  const [state, setState] = React.useState<VoteState>({ votes, voted });
  const busy = React.useRef(false);

  // Follow fresh server data (after a refetch) but never fight an in-flight vote.
  React.useEffect(() => {
    if (!busy.current) setState({ votes, voted });
  }, [votes, voted]);

  async function onClick() {
    if (busy.current) return;
    busy.current = true;
    try {
      if (!(await ensureWriter())) return;
      const outcome = await runVote(
        state,
        (next) => setVote({ data: { postId, voted: next } }),
        setState,
      );
      if (!outcome.ok) reportError(outcome.error);
    } finally {
      busy.current = false;
    }
  }

  const label = state.voted
    ? `Remove your vote from “${postTitle}”, ${state.votes} ${state.votes === 1 ? "vote" : "votes"}`
    : `Vote for “${postTitle}”, ${state.votes} ${state.votes === 1 ? "vote" : "votes"}`;

  return (
    <button
      type="button"
      aria-pressed={state.voted}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "relative z-10 flex shrink-0 items-center justify-center border text-sm font-medium tabular-nums outline-none transition-colors",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
        state.voted
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "bg-background hover:bg-muted",
        variant === "rail"
          ? "size-14 flex-col gap-0.5 md:size-16"
          : "h-9 min-w-14 gap-1.5 px-3 max-md:h-11",
        className,
      )}
    >
      <ArrowUpIcon className="size-4" aria-hidden="true" />
      <span>{state.votes}</span>
    </button>
  );
}
