import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { PublicPostPage } from "@feedbax/feedback";
import type { PortalFeatures } from "@feedbax/config";

import { Button } from "@feedbax/ui/components/button";
import { Kbd, KbdGroup } from "@feedbax/ui/components/kbd";
import { Spinner } from "@feedbax/ui/components/spinner";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@feedbax/ui/components/command";
import { FileText, LayoutList, Map, Newspaper, Plus } from "lucide-react";
import { publicPostsQuery } from "../post-queries";
import { useCommandPalette } from "./command-palette-context";
import feedbax from "../feedbax";
import { useDeviceProfile } from "./device-profile-provider";

export {
  CommandPaletteProvider,
  CommandPaletteTrigger,
  useCommandPalette,
} from "./command-palette-context";

type SearchPosts = (term: string) => Promise<PublicPostPage>;
type NavigationTarget = "/" | "/roadmap" | "/changelog";

export function CommandPalette({
  searchPosts,
  features = feedbax.features,
}: {
  searchPosts: SearchPosts;
  features?: PortalFeatures;
}) {
  const router = useRouter();
  const { open, setOpen } = useCommandPalette();
  const [term, setTerm] = useState("");
  const [selection, setSelection] = useState("go-feedback");
  const deferredTerm = useDebouncedValue(term, 200);
  const { completeProfile, openProfileSetup } = useDeviceProfile();

  useEffect(() => {
    if (!open) {
      setTerm("");
      setSelection("go-feedback");
    }
  }, [open]);

  const query = useInfiniteQuery({
    ...publicPostsQuery(
      { search: deferredTerm, sort: features.voting ? "top" : "new" },
      (search) => searchPosts(search.search ?? ""),
    ),
    enabled: open && deferredTerm.trim().length > 0,
  });
  const posts = query.data?.pages.flatMap((page) => page.items) ?? [];
  const hasTerm = term.trim().length > 0;
  const settling = term.trim() !== deferredTerm.trim();
  const showEmpty =
    open &&
    deferredTerm.trim().length > 0 &&
    !query.isPending &&
    !query.isError &&
    !settling &&
    posts.length === 0;
  const searching = open && hasTerm && (settling || query.isFetching);
  const searchStatus = searching
    ? "Searching Posts…"
    : showEmpty
      ? "No Posts match this search."
      : deferredTerm.trim().length > 0 && posts.length > 0
        ? `${posts.length} ${posts.length === 1 ? "Post" : "Posts"} found.`
        : "";

  useEffect(() => {
    const firstPost = posts[0];
    if (firstPost) setSelection(`post-${firstPost.slug}`);
  }, [posts[0]?.slug]);

  function getCurrentRouteOptions() {
    const currentRoute = router.state.matches.at(-1);
    if (!currentRoute) return undefined;
    return {
      from: currentRoute.fullPath,
      to: "." as const,
      params: currentRoute.params,
      search: currentRoute.search,
    };
  }

  function openPost(slug: string) {
    const currentRouteOptions = getCurrentRouteOptions();
    if (!currentRouteOptions) return;
    setOpen(false);
    router.navigate({
      ...currentRouteOptions,
      state: { postDetailOverlay: { slug } },
      mask: {
        to: "/p/$slug",
        params: { slug },
        unmaskOnReload: true,
      },
    });
  }

  function navigate(to: NavigationTarget) {
    setOpen(false);
    router.navigate({ to });
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search feedback"
      description="Find Posts and navigate the portal."
      className="sm:max-w-xl"
    >
      <Command
        shouldFilter={false}
        className="gap-0"
        value={selection}
        onValueChange={setSelection}
      >
        <CommandInput
          aria-label="Search feedback"
          value={term}
          onValueChange={setTerm}
          placeholder="Search feedback…"
        />
        <CommandList
          aria-busy={searching || undefined}
          className="min-h-28 max-h-96 p-2"
        >
          {showEmpty ? (
            <CommandEmpty>No Posts match this search.</CommandEmpty>
          ) : null}
          {query.isError && hasTerm ? (
            <div
              role="alert"
              className="space-y-3 px-4 py-8 text-center text-sm text-muted-foreground"
            >
              <p>Search is unavailable. Try again.</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Retry search
              </Button>
            </div>
          ) : null}
          {searching ? (
            <div
              role="status"
              className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground"
            >
              <Spinner aria-hidden="true" />
              Searching Posts…
            </div>
          ) : null}
          {hasTerm && !searching && !query.isError && posts.length > 0 ? (
            <CommandGroup heading="Posts">
              {posts.map((post) => (
                <CommandItem
                  key={post.slug}
                  value={`post-${post.slug}`}
                  onSelect={() => openPost(post.slug)}
                  className="min-h-14 gap-3"
                >
                  <FileText aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {post.title}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {post.description}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <span className="block">{post.status}</span>
                    <span className="mt-1 hidden sm:block">{post.type}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {!term.trim() ? (
            <CommandGroup heading="Navigate">
              <CommandItem
                className="min-h-11"
                value="go-feedback"
                onSelect={() => navigate("/")}
              >
                <LayoutList aria-hidden="true" />
                Feedback
              </CommandItem>
              <CommandItem
                className="min-h-11"
                value="go-roadmap"
                onSelect={() => navigate("/roadmap")}
              >
                <Map aria-hidden="true" />
                Roadmap
              </CommandItem>
              {features.changelog ? (
                <CommandItem
                  className="min-h-11"
                  value="go-changelog"
                  onSelect={() => navigate("/changelog")}
                >
                  <Newspaper aria-hidden="true" />
                  Changelog
                </CommandItem>
              ) : null}
              <CommandItem
                className="min-h-11"
                value="new-post"
                onSelect={() => {
                  if (!completeProfile) {
                    setOpen(false);
                    openProfileSetup();
                    return;
                  }
                  const currentRouteOptions = getCurrentRouteOptions();
                  if (!currentRouteOptions) return;
                  setOpen(false);
                  router.navigate({
                    ...currentRouteOptions,
                    state: { createPostOverlay: true },
                    mask: { to: "/submit", unmaskOnReload: true },
                  });
                }}
              >
                <Plus aria-hidden="true" />
                New post
              </CommandItem>
            </CommandGroup>
          ) : null}
        </CommandList>
        <div className="flex items-center justify-between gap-4 border-t px-4 py-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <KbdGroup>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
            </KbdGroup>{" "}
            to navigate <Kbd>↵</Kbd> to open
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Esc</Kbd> to close
          </span>
        </div>
        <div aria-label="Search status" className="sr-only" role="status">
          {searchStatus}
        </div>
      </Command>
    </CommandDialog>
  );
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}
