import { createServerFn } from "@tanstack/react-start";
import { loadPublicChangelogPage } from "./public-changelog-page";
import { runSafePublicRead } from "./safe-public-failure";

export const getPublicChangelogPage = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    if (input === undefined) return {};
    if (!input || typeof input !== "object")
      throw new Error("Changelog request is invalid.");
    const cursor = Reflect.get(input, "cursor");
    const label = Reflect.get(input, "label");
    if (cursor !== undefined && typeof cursor !== "string")
      throw new Error("Changelog request is invalid.");
    if (label !== undefined && typeof label !== "string")
      throw new Error("Changelog request is invalid.");
    return { ...(cursor ? { cursor } : {}), ...(label ? { label } : {}) };
  })
  .handler(({ data }) =>
    runSafePublicRead(async () => {
      const { createConfiguredChangelogModule } =
        await import("./changelog-runtime");
      return loadPublicChangelogPage({
        changelog: createConfiguredChangelogModule(),
        query: data,
      });
    }),
  );
