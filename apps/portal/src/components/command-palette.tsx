import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { PublicPostPage } from "@feedbax/feedback";

import { Badge } from "@feedbax/ui/components/badge";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@feedbax/ui/components/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@feedbax/ui/components/dialog";
import { publicPostsQuery } from "../post-queries";
import { useCommandPalette } from "./command-palette-context";

export {
  CommandPaletteProvider,
  CommandPaletteTrigger,
  useCommandPalette,
} from "./command-palette-context";

type SearchPosts = (term: string) => Promise<PublicPostPage>;
type NavigationTarget = "/" | "/roadmap" | "/changelog";

export function CommandPalette({ searchPosts }: { searchPosts: SearchPosts }) {
  const router = useRouter();
  const { open, setOpen } = useCommandPalette();
  const [term, setTerm] = useState("");
  const [selection, setSelection] = useState("go-feedback");
  const deferredTerm = useDebouncedValue(term, 200);

  useEffect(() => {
    if (!open) {
      setTerm("");
      setSelection("go-feedback");
    }
  }, [open]);

  const query = useInfiniteQuery({
    ...publicPostsQuery({ search: deferredTerm, sort: "trending" }, (search) =>
      searchPosts(search.search ?? ""),
    ),
    enabled: open && deferredTerm.trim().length > 0,
  });
  const posts = query.data?.pages.flatMap((page) => page.items) ?? [];
  const showEmpty =
    open &&
    deferredTerm.trim().length > 0 &&
    !query.isPending &&
    posts.length === 0;

  useEffect(() => {
    const firstPost = posts[0];
    if (firstPost) setSelection(`post-${firstPost.slug}`);
  }, [posts]);

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Search feedback</DialogTitle>
          <DialogDescription>
            Find Posts and navigate the portal.
          </DialogDescription>
        </DialogHeader>
        <Command
          shouldFilter={false}
          className="gap-0"
          value={selection}
          onValueChange={setSelection}
        >
          <CommandInput
            value={term}
            onValueChange={setTerm}
            placeholder="Search feedback…"
          />
          <CommandList className="max-h-96">
            {showEmpty ? (
              <div
                className="py-6 text-center text-sm text-muted-foreground"
                role="status"
              >
                No Posts match this search.
              </div>
            ) : null}
            {posts.length > 0 ? (
              <CommandGroup heading="Posts">
                {posts.map((post) => (
                  <CommandItem
                    key={post.slug}
                    value={`post-${post.slug}`}
                    onSelect={() => openPost(post.slug)}
                    className="gap-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {post.title}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {post.description}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge variant="outline">{post.type}</Badge>
                      <Badge variant="outline">{post.status}</Badge>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            <CommandSeparator />
            <CommandGroup heading="Navigate">
              <CommandItem value="go-feedback" onSelect={() => navigate("/")}>
                Feedback
              </CommandItem>
              <CommandItem
                value="go-roadmap"
                onSelect={() => navigate("/roadmap")}
              >
                Roadmap
              </CommandItem>
              <CommandItem
                value="go-changelog"
                onSelect={() => navigate("/changelog")}
              >
                Changelog
              </CommandItem>
              <CommandItem
                value="new-post"
                onSelect={() => {
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
                New post
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
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
