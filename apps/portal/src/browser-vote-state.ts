const votedPostsKey = "feedbax:voted-posts";

export function readVotedPostSlugs(
  storage: Pick<Storage, "getItem">,
): Set<string> {
  try {
    const value: unknown = JSON.parse(storage.getItem(votedPostsKey) ?? "[]");
    return new Set(
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

export function persistVotedPost(
  storage: Pick<Storage, "getItem" | "setItem">,
  slug: string,
  voted: boolean,
): void {
  const slugs = readVotedPostSlugs(storage);
  if (voted) slugs.add(slug);
  else slugs.delete(slug);
  storage.setItem(votedPostsKey, JSON.stringify([...slugs]));
}
