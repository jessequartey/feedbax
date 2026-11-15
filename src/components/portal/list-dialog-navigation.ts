import type { BoardSearch, RoadmapSearch } from "./portal-search";

type ListLocation = { pathname: string; search: Record<string, unknown> };
export type DialogSearch = { dialog?: string };

/** Private list state. The mask supplies the public, shareable URL. */
export function parseDialogSearch(raw: Record<string, unknown>): DialogSearch {
  return typeof raw.dialog === "string" &&
    (raw.dialog === "submit" ||
      /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(raw.dialog))
    ? { dialog: raw.dialog }
    : {};
}

export function listDialogOptions(location: ListLocation, dialog: string) {
  if (location.pathname !== "/" && location.pathname !== "/roadmap") return null;
  return {
    to: location.pathname,
    search: { ...location.search, dialog } as (BoardSearch | RoadmapSearch) & DialogSearch,
    mask:
      dialog === "submit"
        ? { to: "/submit" as const, search: {}, unmaskOnReload: true }
        : {
            to: "/posts/$postId" as const,
            params: { postId: dialog },
            search: {},
            unmaskOnReload: true,
          },
    resetScroll: false,
    // The overlay fetches only after opening, never on a row's hover/focus.
    preload: false as const,
  };
}
