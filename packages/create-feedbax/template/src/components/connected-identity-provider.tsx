import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import feedbax from "../feedbax";
import { Button } from "@feedbax/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@feedbax/ui/components/item";

type IdentityState = {
  enabled: boolean;
  ready: boolean;
  displayName?: string;
  error?: string;
  signOut: () => Promise<void>;
};
const IdentityContext = createContext<IdentityState>({
  enabled: Boolean(feedbax.connected),
  ready: !feedbax.connected,
  signOut: async () => {},
});
export function useConnectedIdentity() {
  return useContext(IdentityContext);
}
export function ConnectedIdentityProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<{
    ready: boolean;
    displayName?: string;
    error?: string;
  }>({ ready: !feedbax.connected });
  useEffect(() => {
    if (!feedbax.connected) return;
    const controller = new AbortController();
    fetch("/internal/identity/session", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const value = await response.json();
        setState({ ready: true, displayName: value.participant?.displayName });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({
            ready: true,
            error: "Sign-in is temporarily unavailable.",
          });
      });
    return () => controller.abort();
  }, []);
  async function signOut() {
    const response = await fetch("/internal/identity/logout", {
      method: "POST",
    });
    if (!response.ok) {
      setState((current) => ({
        ...current,
        error: "Sign-out failed. Try again.",
      }));
      return;
    }
    window.location.reload();
  }
  return (
    <IdentityContext.Provider
      value={{ enabled: Boolean(feedbax.connected), ...state, signOut }}
    >
      {children}
    </IdentityContext.Provider>
  );
}
export function ConnectedSignInPrompt() {
  const identity = useConnectedIdentity();
  return (
    <Item variant="muted" size="sm" className="my-4">
      <ItemContent className="min-w-36">
        <ItemTitle>Join the conversation</ItemTitle>
        <ItemDescription className="line-clamp-none">
          {identity.error ?? "Sign in with your product account to comment."}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          nativeButton={false}
          render={<a href="/internal/identity/start" />}
          variant="outline"
          size="sm"
          disabled={!identity.ready}
        >
          Sign in
        </Button>
      </ItemActions>
    </Item>
  );
}
