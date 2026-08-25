import { expect, it } from "vitest";
import { persistVotedPost, readVotedPostSlugs } from "./browser-vote-state";

it("remembers and removes voted Post identifiers in browser storage", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
  persistVotedPost(storage, "keyboard-navigation", true);
  expect(readVotedPostSlugs(storage)).toEqual(new Set(["keyboard-navigation"]));
  persistVotedPost(storage, "keyboard-navigation", false);
  expect(readVotedPostSlugs(storage)).toEqual(new Set());
});
