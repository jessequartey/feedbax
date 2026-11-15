import { cuss } from "cuss";
import type { ModerationProvider } from "./types.ts";

// MIT-licensed words/cuss dataset. Prefer rating 2, plus common swears rated 1.
// Other ambiguous/innocent terms (identities, medical terms, names) stay excluded.
const MAX_WORD = 64;
const LETTER = /[\p{L}\p{N}]/u;
const SPACE = /\s/u;
// Character kinds: punctuation and symbols, letters and digits, whitespace.
const SEPARATOR = 0,
  WORD = 1,
  SPACE_KIND = 2;
function kind(char: string): number {
  const code = char.codePointAt(0)!;
  if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) return WORD;
  if (code < 128) return code <= 32 ? SPACE_KIND : SEPARATOR;
  return LETTER.test(char) ? WORD : SPACE.test(char) ? SPACE_KIND : SEPARATOR;
}
const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};
function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\p{M}\u200b-\u200d\u2060\ufeff]/gu, "")
    .replace(/(?<=[\p{L}\p{N}])!(?=[\p{L}\p{N}])/gu, "i")
    .replace(/[013457@$]/g, (char) => LEET[char])
    .replace(/(.)\1{2,}/gu, (run, char: string) => ("beglos".includes(char) ? char + char : char));
}
type Node = { next: Map<string, Node>; terminal: boolean };
const node = (): Node => ({ next: new Map(), terminal: false });
const compact = (word: string) => normalize(word).replace(/[^\p{L}\p{N}]/gu, "");
const commonSwears = new Set([
  "shit",
  "shits",
  "shitty",
  "bullshit",
  "bitch",
  "bitches",
  "bastard",
  "bastards",
  "arse",
  "arsehole",
]);
// Leet spellings ("brea5t") normalize onto milder words ("breast", rated 0); skip those.
// Also skip entries that normalize to under three letters ("kkk" becomes "k", "fu" is in
// "kung fu") and short everyday words or names, so ordinary feedback is never held.
const innocent = new Set(["dix", "ero", "evl", "jig", "kwa", "nip", "pom", "poo", "pud", "wab"]);
function defaultWords(): string[] {
  const mild = new Set(
    Object.entries(cuss)
      .filter(([word, rating]) => rating < 2 && !commonSwears.has(word))
      .map(([word]) => compact(word)),
  );
  return Object.entries(cuss)
    .filter(([word, rating]) => {
      if (commonSwears.has(word)) return true;
      const key = compact(word);
      return rating === 2 && key.length >= 3 && !mild.has(key) && !innocent.has(key);
    })
    .map(([word]) => word);
}

/** List entries keep one space between the words of a phrase; other separators are dropped. */
function entryKey(word: string): string {
  return normalize(word)
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Compile only when settings change; no regex supplied by an admin is ever executed. */
export function createWordListProvider(
  blockedWords: string[] = [],
  allowedWords: string[] = [],
): ModerationProvider {
  const root = node();
  const allowed = new Set(allowedWords.flatMap((word) => [entryKey(word), compact(word)]));
  const insert = (key: string) => {
    if (!key || Array.from(key).length > MAX_WORD || allowed.has(key)) return;
    let current = root;
    for (const char of key) {
      let child = current.next.get(char);
      if (!child) {
        child = node();
        current.next.set(char, child);
      }
      current = child;
    }
    current.terminal = true;
  };
  for (const word of [...defaultWords(), ...blockedWords]) {
    // A phrase matches with spaces ("camel toe") and run together ("cameltoe").
    insert(entryKey(word));
    insert(compact(word));
  }
  return {
    check(text) {
      const chars = Array.from(normalize(text));
      // Classify each code point once; ASCII feedback avoids Unicode regex work here.
      const kinds = Uint8Array.from(chars, kind);
      const word = (at: number) => kinds[at] === WORD;
      // After a lone letter, does another lone letter follow (the "c" in "f.u.c.k")?
      const spelling = (at: number) => {
        while (at < chars.length && !word(at)) at++;
        return word(at) && !word(at + 1);
      };
      // Is this lone letter the middle of a spelling (the "u" in "f.u.c.k")?
      const spelled = (at: number) => {
        if (word(at + 1)) return false;
        while (at > 0 && !word(at - 1)) at--;
        return at > 0 && !word(at - 2);
      };
      // A match starts and ends on whole-word edges, so Scunthorpe, assessment and classic
      // pass. Inside a match, punctuation is skipped (f.u.c.k, f*uck, sh-it), but whitespace
      // only between spelled-out letters (f u c k) or between the words of a listed phrase,
      // so "let's hit" or "pen is" never join into a word. Each start examines at most
      // 256 code points, independent of list size: O(n) per check.
      for (let start = 0; start < chars.length; start++) {
        if (!word(start) || (start > 0 && word(start - 1)) || spelled(start)) continue;
        const stop = Math.min(chars.length, start + MAX_WORD * 4);
        let current: Node | undefined = root,
          segment = 0,
          end = start;
        while (current && end < stop) {
          if (word(end)) {
            current = current.next.get(chars[end]);
            segment++;
            if (current?.terminal && !word(end + 1) && !(segment === 1 && spelling(end + 1)))
              return { verdict: "flag", reasons: ["profanity"] };
            end++;
            continue;
          }
          let next = end,
            spaced = false;
          while (next < stop && !word(next)) spaced ||= kinds[next++] === SPACE_KIND;
          if (spaced) {
            const phrase = current.next.get(" ");
            if (phrase) current = phrase;
            else if (segment !== 1 || word(next + 1)) break;
          }
          segment = 0;
          end = next;
        }
      }
      return { verdict: "allow", reasons: [] };
    },
  };
}

// Compiled on the first check, not at import, so read-only cold starts skip it (~2 ms).
let cachedKey: string | undefined;
let cachedProvider: ModerationProvider | undefined;
/** One compiled list per isolate; recompiled only when the custom words change. */
export function wordListProvider(
  blockedWords: string[],
  allowedWords: string[],
): ModerationProvider {
  const key = JSON.stringify([blockedWords, allowedWords]);
  if (key !== cachedKey || !cachedProvider) {
    cachedProvider = createWordListProvider(blockedWords, allowedWords);
    cachedKey = key;
  }
  return cachedProvider;
}
