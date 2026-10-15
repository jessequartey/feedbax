import { publicPostQueryKey } from "./post-detail-query";
import { useConnectedIdentity } from "./components/connected-identity-provider";
import { configuredTurnstileSiteKey } from "./turnstile-configuration";
import type { PublicPost } from "@feedbax/feedback";
import { ChevronUp } from "lucide-react";
import { useContext, useEffect, useRef, useState } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { readVotedPostSlugs, persistVotedPost } from "./browser-vote-state";
import { publicPostsQueryKey } from "./post-queries";
import { publicRoadmapQueryKey } from "./roadmap-query";

const voteConfirmedEvent = "feedbax:vote-confirmed";

declare global {
  interface Window {
    turnstile?: {
      render(element: HTMLElement, options: { sitekey: string }): string;
      reset(widgetId: string): void;
    };
  }
}

export function VoteToggle({
  post,
  turnstileSiteKey = configuredTurnstileSiteKey(),
  requestTimeoutMs = 10_000,
}: {
  post: PublicPost;
  turnstileSiteKey?: string;
  requestTimeoutMs?: number;
}) {
  const identity = useConnectedIdentity();
  const queryClient = useContext(QueryClientContext);
  const [voted, setVoted] = useState(false);
  const [count, setCount] = useState(post.voteCount ?? 0);
  const [pending, setPending] = useState(false);
  const [voteStateReady, setVoteStateReady] = useState(!identity.enabled);
  const [error, setError] = useState<string>();
  const [participationPass, setParticipationPass] = useState<string>();
  const form = useRef<HTMLFormElement>(null);
  const turnstileContainer = useRef<HTMLDivElement>(null);
  const turnstileWidget = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!identity.enabled)
      setVoted(readVotedPostSlugs(localStorage).has(post.slug));
    setCount(post.voteCount ?? 0);
    setParticipationPass(
      sessionStorage.getItem("feedbax:participation-pass") ?? undefined,
    );
  }, [post.slug, post.voteCount, identity.enabled]);
  useEffect(() => {
    if (!identity.enabled || !identity.displayName) return;
    const controller = new AbortController();
    setVoteStateReady(false);
    fetch(`/internal/connected/votes?slug=${encodeURIComponent(post.slug)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Could not load your Vote. Refresh and try again.");
        const state = await response.json();
        setVoteStateReady(true);
        setVoted(state.voted);
        setCount(state.voteCount);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, [identity.enabled, identity.displayName, post.slug]);
  useEffect(() => {
    const reconcile = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          slug: string;
          voteCount: number;
          voted: boolean;
        }>
      ).detail;
      if (detail.slug !== post.slug) return;
      setCount(detail.voteCount);
      setVoted(detail.voted);
    };
    window.addEventListener(voteConfirmedEvent, reconcile);
    return () => window.removeEventListener(voteConfirmedEvent, reconcile);
  }, [post.slug]);
  useEffect(() => {
    if (!turnstileSiteKey || participationPass || !turnstileContainer.current)
      return;
    const render = () => {
      if (
        !turnstileWidget.current &&
        window.turnstile &&
        turnstileContainer.current
      ) {
        turnstileWidget.current = window.turnstile.render(
          turnstileContainer.current,
          { sitekey: turnstileSiteKey },
        );
      }
    };
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-turnstile]",
    );
    if (existing) {
      if (window.turnstile) render();
      else existing.addEventListener("load", render, { once: true });
      return () => existing.removeEventListener("load", render);
    }
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = "true";
    script.addEventListener("load", render, { once: true });
    document.head.append(script);
    return () => script.removeEventListener("load", render);
  }, [participationPass, turnstileSiteKey]);

  async function toggle() {
    if (identity.enabled && !identity.displayName) {
      window.location.href = "/internal/identity/start";
      return;
    }
    const previous = { voted, count };
    const nextVoted = !voted;
    setVoted(nextVoted);
    setCount(Math.max(0, count + (nextVoted ? 1 : -1)));
    setPending(true);
    setError(undefined);
    try {
      const turnstileToken = form.current
        ? new FormData(form.current).get("cf-turnstile-response")
        : undefined;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      const response = await fetch("/internal/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          slug: post.slug,
          intention: nextVoted ? "add" : "remove",
          participationPass,
          ...(turnstileToken ? { turnstileToken: String(turnstileToken) } : {}),
        }),
      }).finally(() => clearTimeout(timeout));
      const result = (await response.json()) as {
        voteCount: number;
        participationPass?: string;
        error?: string;
        code?: string;
      };
      if (!response.ok) {
        if (
          result.code === "verification_failed" ||
          result.code === "verification_required"
        ) {
          sessionStorage.removeItem("feedbax:participation-pass");
          setParticipationPass(undefined);
          if (turnstileWidget.current)
            window.turnstile?.reset(turnstileWidget.current);
          turnstileWidget.current = undefined;
        }
        throw new Error(result.error ?? "Vote failed. Try again.");
      }
      setCount(result.voteCount);
      if (!identity.enabled)
        persistVotedPost(localStorage, post.slug, nextVoted);
      window.dispatchEvent(
        new CustomEvent(voteConfirmedEvent, {
          detail: {
            slug: post.slug,
            voteCount: result.voteCount,
            voted: nextVoted,
          },
        }),
      );
      if (queryClient) {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: publicPostsQueryKey }),
          queryClient.invalidateQueries({ queryKey: publicPostQueryKey }),
          queryClient.invalidateQueries({ queryKey: publicRoadmapQueryKey }),
        ]);
      }
      if (result.participationPass) {
        sessionStorage.setItem(
          "feedbax:participation-pass",
          result.participationPass,
        );
        setParticipationPass(result.participationPass);
      }
    } catch (cause) {
      setVoted(previous.voted);
      setCount(previous.count);
      setError(
        cause instanceof DOMException && cause.name === "AbortError"
          ? "Vote timed out. Check your connection and try again."
          : cause instanceof Error
            ? cause.message
            : "Vote failed. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={form} onSubmit={(event) => event.preventDefault()}>
      <button
        className="vote-toggle-button"
        type="button"
        aria-pressed={voted}
        aria-label={`${voted ? "Remove Vote" : "Add Vote"}, ${count} Votes`}
        disabled={
          pending ||
          (identity.enabled &&
            (!identity.ready ||
              (Boolean(identity.displayName) && !voteStateReady)))
        }
        onClick={toggle}
      >
        <ChevronUp aria-hidden="true" /> {count}
      </button>
      {turnstileSiteKey && !participationPass ? (
        <div
          ref={(element) => {
            turnstileContainer.current = element;
            if (element && window.turnstile && !turnstileWidget.current) {
              turnstileWidget.current = window.turnstile.render(element, {
                sitekey: turnstileSiteKey,
              });
            }
          }}
          className="cf-turnstile"
        />
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
