import type { Viewer } from "@/contracts/portal";

type MatchLike = { routeId: string; loaderData?: unknown };

/** `<page> · <product name>`, with the name coming from the portal loader's config. */
export function pageTitle(matches: readonly MatchLike[] | undefined, page?: string) {
  const portal = matches?.find((m) => m.routeId === "/_portal")?.loaderData as Viewer | undefined;
  const name = portal?.config?.name ?? "Feedbax";
  return { meta: [{ title: page ? `${page} · ${name}` : name }] };
}
