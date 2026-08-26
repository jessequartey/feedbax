export type ChangelogDate = `${number}-${number}-${number}`;

export interface ChangelogImage {
  src: string;
  alt: string;
  expiresAt?: Date;
}

export interface StoredChangelogEntry {
  id: string;
  slug: string;
  date: ChangelogDate;
  title: string;
  summary: string;
  body: string;
  labels: string[];
  images: ChangelogImage[];
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type PublicChangelogEntry = Pick<
  StoredChangelogEntry,
  "slug" | "date" | "title" | "summary" | "body" | "labels" | "updatedAt"
> & { image?: ChangelogImage };

export interface ChangelogPage {
  items: PublicChangelogEntry[];
  nextCursor?: string;
}

export interface ChangelogQuery {
  cursor?: string;
  label?: string;
}

export interface ChangelogStorage {
  listPublished(query: ChangelogQuery): Promise<ChangelogPage>;
}

export interface ChangelogModule {
  listPublishedEntries(query?: ChangelogQuery): Promise<ChangelogPage>;
}

export {
  createNotionChangelogDataSource,
  createNotionChangelogStorage,
  validateNotionChangelogDataSource,
  type ChangelogDataSourceConfiguration,
  type ChangelogPropertyIds,
  type NotionChangelogStorageOptions,
} from "./notion-changelog";

export function createChangelogModule({
  storage,
  now = () => new Date(),
}: {
  storage: ChangelogStorage;
  now?: () => Date;
}): ChangelogModule {
  const textFallbacks = new Map<
    string,
    { cachedAt: number; page: ChangelogPage }
  >();
  return {
    async listPublishedEntries(query = {}) {
      const key = fallbackKey(query);
      try {
        const page = await storage.listPublished(query);
        const projected = projectSafeImages(page, now());
        rememberTextFallback(textFallbacks, key, page, now());
        return projected;
      } catch (error) {
        const fallback = textFallbacks.get(key);
        if (fallback && fallback.cachedAt + 86_400_000 > now().getTime()) {
          return fallback.page;
        }
        throw error;
      }
    },
  };
}

function projectSafeImages(page: ChangelogPage, now: Date): ChangelogPage {
  return {
    ...page,
    items: page.items.map((entry) =>
      entry.image && !isSafeForProjection(entry.image, now)
        ? withoutImage(entry)
        : entry,
    ),
  };
}

function rememberTextFallback(
  fallbacks: Map<string, { cachedAt: number; page: ChangelogPage }>,
  key: string,
  page: ChangelogPage,
  now: Date,
): void {
  if (!fallbacks.has(key) && fallbacks.size >= 100) {
    const oldestKey = fallbacks.keys().next().value as string | undefined;
    if (oldestKey) fallbacks.delete(oldestKey);
  }
  fallbacks.set(key, {
    cachedAt: now.getTime(),
    page: {
      ...page,
      items: page.items.map(withoutImage),
    },
  });
}

function fallbackKey(query: ChangelogQuery): string {
  return JSON.stringify({
    cursor: query.cursor ?? null,
    label: query.label ?? null,
  });
}

function isSafeForProjection(image: ChangelogImage, now: Date): boolean {
  if (!image.expiresAt) return true;
  return image.expiresAt.getTime() > now.getTime() + 60_000;
}

function withoutImage(entry: PublicChangelogEntry): PublicChangelogEntry {
  const textEntry = { ...entry };
  delete textEntry.image;
  return textEntry;
}

export function createInMemoryChangelogStorage(
  initialEntries: StoredChangelogEntry[] = [],
): ChangelogStorage {
  const entries = structuredClone(initialEntries);
  return {
    async listPublished(query) {
      const offset = decodeCursor(query.cursor, query.label);
      const matching = entries
        .filter(
          (entry) =>
            entry.published &&
            (!query.label || entry.labels.includes(query.label)),
        )
        .sort(compareEntries);
      const page = matching.slice(offset, offset + 20);
      const nextOffset = offset + page.length;
      return {
        items: page.map(toPublicEntry),
        ...(nextOffset < matching.length
          ? { nextCursor: encodeCursor(nextOffset, query.label) }
          : {}),
      };
    },
  };
}

function compareEntries(
  left: StoredChangelogEntry,
  right: StoredChangelogEntry,
): number {
  return right.date.localeCompare(left.date) || left.id.localeCompare(right.id);
}

function toPublicEntry(entry: StoredChangelogEntry): PublicChangelogEntry {
  const [image] = entry.images;
  return {
    slug: entry.slug,
    date: entry.date,
    title: entry.title,
    summary: entry.summary,
    body: entry.body,
    labels: [...entry.labels],
    updatedAt: new Date(entry.updatedAt),
    ...(image ? { image: structuredClone(image) } : {}),
  };
}

function encodeCursor(offset: number, label?: string): string {
  return Buffer.from(JSON.stringify({ offset, label: label ?? null })).toString(
    "base64url",
  );
}

function decodeCursor(cursor: string | undefined, label?: string): number {
  if (!cursor) return 0;
  try {
    const value: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (!value || typeof value !== "object") throw new Error();
    const offset = Reflect.get(value, "offset");
    const cursorLabel = Reflect.get(value, "label");
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      cursorLabel !== (label ?? null)
    ) {
      throw new Error();
    }
    return offset as number;
  } catch {
    throw new Error("Changelog cursor does not match this timeline view.");
  }
}
