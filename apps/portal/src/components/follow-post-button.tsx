import { Bell, BellRing } from "lucide-react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@feedbax/ui/components/button";
import { useConnectedIdentity } from "./connected-identity-provider";
import { followQuery, participationRequest } from "../participation-client";

export function FollowPostButton({ slug }: { slug: string }) {
  const identity = useConnectedIdentity();
  if (!identity.enabled) return null;
  return <ConnectedFollowPostButton slug={slug} />;
}
function ConnectedFollowPostButton({ slug }: { slug: string }) {
  const identity = useConnectedIdentity();
  const queryClient = useQueryClient();
  const state = useQuery({
    ...followQuery(slug),
    enabled: identity.enabled && Boolean(identity.displayName),
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  if (!identity.enabled) return null;
  if (!identity.displayName)
    return (
      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        render={<a href="/internal/identity/start" />}
      >
        Sign in to follow
      </Button>
    );
  async function toggle() {
    setPending(true);
    setError(undefined);
    try {
      const result = await participationRequest<{ following: boolean }>(
        "follow",
        { slug, following: !state.data?.following },
      );
      queryClient.setQueryData(followQuery(slug).queryKey, result);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn’t update Follow.",
      );
    } finally {
      setPending(false);
    }
  }
  const following = state.data?.following;
  return (
    <div className="space-y-2">
      <Button
        variant={following ? "secondary" : "outline"}
        size="sm"
        onClick={state.isError ? () => void state.refetch() : toggle}
        disabled={pending || state.isPending}
        aria-pressed={Boolean(following)}
      >
        {following ? (
          <BellRing aria-hidden="true" />
        ) : (
          <Bell aria-hidden="true" />
        )}
        {state.isError
          ? "Retry follow status"
          : pending
            ? "Updating…"
            : following
              ? "Following"
              : "Follow updates"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
