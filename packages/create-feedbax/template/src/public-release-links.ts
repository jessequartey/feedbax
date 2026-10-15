import type { FeedbackModule, PublicPost } from "@feedbax/feedback";
import type { ChangelogModule } from "@feedbax/changelog";

export function createPublicReleaseFeedbackModule(options: {
  feedback: FeedbackModule;
  siteUrl?: string;
  changelog?: ChangelogModule;
  request?: typeof fetch;
}): FeedbackModule {
  const { feedback } = options;
  let published: Promise<Set<string>> | undefined;
  const publishedSlugs = () =>
    (published ??= (async () => {
      const slugs = new Set<string>();
      if (!options.changelog) return slugs;
      let cursor: string | undefined;
      for (let page = 0; page < 10; page++) {
        const result = await options.changelog.listPublishedEntries({ cursor });
        for (const entry of result.items) slugs.add(entry.slug);
        cursor = result.nextCursor;
        if (!cursor) break;
      }
      return slugs;
    })());
  const resolve = async (value: string) => {
    if (
      /[\\\s]/u.test(value) ||
      Array.from(value).some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      return;
    try {
      const url = new URL(value, options.siteUrl ?? "https://feedbax.invalid");
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        value.startsWith("//")
      )
        return;
      const local =
        value.startsWith("/") ||
        (options.siteUrl && url.origin === new URL(options.siteUrl).origin);
      if (!local) {
        const host = url.hostname.toLowerCase().replace(/\.+$/, "");
        if (
          [
            "api.github.com",
            "gist.github.com",
            "raw.githubusercontent.com",
          ].includes(host)
        )
          return;
        if (host === "github.com" || host === "www.github.com") {
          const path = decodeURIComponent(url.pathname);
          const release = path.match(
            /^\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)\/releases(?:\/|$)/,
          );
          if (!release || path.includes("%")) return;
          const response = await (options.request ?? fetch)(
            `https://api.github.com/repos/${release[1]}/${release[2]}`,
            {
              redirect: "manual",
              signal: AbortSignal.timeout(5000),
              headers: {
                Accept: "application/vnd.github+json",
                "User-Agent": "Feedbax",
                "X-GitHub-Api-Version": "2026-03-10",
              },
            },
          );
          if (!response.ok) return;
          const repository: unknown = await response.json();
          if (
            !repository ||
            typeof repository !== "object" ||
            Reflect.get(repository, "private") !== false
          )
            return;
        }
        return value;
      }
      if (
        url.pathname !== "/changelog" ||
        url.search ||
        !/^#[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.hash)
      )
        return;
      return (await publishedSlugs()).has(url.hash.slice(1))
        ? value
        : undefined;
    } catch {
      return;
    }
  };
  const project = async <T extends PublicPost>(post: T): Promise<T> => {
    if (!post.releaseNotesUrl) return post;
    const url = await resolve(post.releaseNotesUrl);
    const result = { ...post };
    if (url) result.releaseNotesUrl = url;
    else delete result.releaseNotesUrl;
    return result;
  };
  const roadmap: FeedbackModule["listPublicRoadmapPosts"] = async (query) => {
    const page = await feedback.listPublicRoadmapPosts(query);
    return { ...page, items: await Promise.all(page.items.map(project)) };
  };
  return {
    ...feedback,
    async getPublicPost(slug) {
      const post = await feedback.getPublicPost(slug);
      return post ? project(post) : undefined;
    },
    async listPublicPosts(query) {
      const page = await feedback.listPublicPosts(query);
      return { ...page, items: await Promise.all(page.items.map(project)) };
    },
    listPublicRoadmapPosts: roadmap,
    async getPublicPostRoadmap() {
      const [planned, progress, shipped] = await Promise.all([
        roadmap({ status: "Planned" }),
        roadmap({ status: "In Progress" }),
        roadmap({ status: "Shipped" }),
      ]);
      return { Planned: planned, "In Progress": progress, Shipped: shipped };
    },
  };
}
