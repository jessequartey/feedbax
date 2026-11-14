import type { Viewer } from "@/contracts/portal";

type MatchLike = { routeId: string; loaderData?: unknown };

/** `<page> · <product name>`, with the name coming from the root loader's config. */
export function pageTitle(matches: readonly MatchLike[] | undefined, page?: string) {
  const root = matches?.find((m) => m.routeId === "__root__")?.loaderData as Viewer | undefined;
  const name = root?.config?.name ?? "Feedbax";
  return { meta: [{ title: page ? `${page} · ${name}` : name }] };
}
