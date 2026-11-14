import { describe, expect, it } from "vite-plus/test";

import {
  clearFilters,
  parseBoardSearch,
  parseRoadmapSearch,
  patchSearch,
  toListInput,
} from "../../src/components/portal/portal-search.ts";

describe("board search params", () => {
  it("round-trips every filter through the URL shape", () => {
    const search = {
      q: "dark mode",
      category: "bug",
      status: "planned",
      sort: "top",
      page: 3,
    } as const;
    // What TanStack Router does: serialise to the URL, parse it back, then validate.
    const viaUrl = Object.fromEntries(
      new URLSearchParams(
        Object.entries(search).map(([k, v]) => [k, typeof v === "number" ? String(v) : v]),
      ),
    );
    expect(parseBoardSearch(viaUrl)).toEqual(search);
    expect(parseBoardSearch(search)).toEqual(search);
  });

  it("omits defaults so URLs stay clean", () => {
    expect(parseBoardSearch({ sort: "trending", page: 1 })).toEqual({});
    expect(toListInput({})).toEqual({ sort: "trending", page: 1, limit: 20 });
  });

  it("drops unknown values instead of passing them to the server", () => {
    expect(
      parseBoardSearch({ category: "nope", status: "shipped", sort: "random", page: -2, q: "   " }),
    ).toEqual({});
    expect(parseBoardSearch({ page: "abc" })).toEqual({});
  });

  it("coerces numeric queries and caps their length", () => {
    expect(parseBoardSearch({ q: 123 })).toEqual({ q: "123" });
    expect(parseBoardSearch({ q: "x".repeat(300) }).q).toHaveLength(100);
  });

  it("returns to page 1 when a filter changes", () => {
    expect(patchSearch({ status: "open", page: 4 }, { category: "bug" })).toEqual({
      status: "open",
      category: "bug",
    });
    expect(patchSearch({ page: 4 }, { page: 5 })).toEqual({ page: 5 });
    expect(patchSearch({ sort: "new" }, { status: undefined })).toEqual({ sort: "new" });
  });

  it("clears filters but keeps the sort", () => {
    expect(clearFilters({ q: "a", status: "open", category: "bug", sort: "new", page: 2 })).toEqual(
      {
        sort: "new",
      },
    );
  });

  it("maps search to the server-function input", () => {
    expect(toListInput({ q: "x", status: "done", sort: "new", page: 2 })).toEqual({
      q: "x",
      status: "done",
      sort: "new",
      page: 2,
      limit: 20,
    });
  });

  it("parses roadmap filters", () => {
    expect(parseRoadmapSearch({ q: "a", category: "feature", status: "open" })).toEqual({
      q: "a",
      category: "feature",
    });
  });
});
