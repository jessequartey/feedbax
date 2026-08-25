import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import {
  createNotionFeedbackStorage,
  type NotionFeedbackStorageOptions,
} from "./notion-feedback";
import type {
  FeedbackStorage,
  NewStoredPost,
  StoredPost,
} from "./feedback-storage";

export {
  createNotionFeedbackDataSource,
  validateNotionFeedbackDataSource,
  type FeedbackDataSourceConfiguration,
  type FeedbackPropertyIds,
} from "./notion-data-source";

export type PostType = "Feature Request" | "Bug Report" | "General Feedback";

export type PostStatus =
  "New" | "Reviewing" | "Planned" | "In Progress" | "Shipped" | "Closed";

export interface SubmitPostInput {
  title: string;
  description: string;
  type: PostType;
  submitter?: {
    name?: string;
    email?: string;
  };
}

export interface SubmitTrustedPostInput extends SubmitPostInput {
  externalId: string;
}

export interface Post extends SubmitPostInput {
  id: string;
  slug: string;
  status: PostStatus;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
}

declare const browserCapabilityBrand: unique symbol;

export type BrowserCapability = string & {
  readonly [browserCapabilityBrand]: true;
};

export class BrowserCapabilityAuthorizationError extends Error {
  constructor() {
    super("Browser Capability did not authorize this draft.");
    this.name = "BrowserCapabilityAuthorizationError";
  }
}

export type SubmittedPost = Post & {
  browserCapability: BrowserCapability;
};

export type PublicPost = Pick<
  Post,
  | "slug"
  | "title"
  | "description"
  | "type"
  | "status"
  | "createdAt"
  | "updatedAt"
>;

export type DraftPost = Pick<
  Post,
  | "id"
  | "slug"
  | "title"
  | "description"
  | "type"
  | "status"
  | "createdAt"
  | "updatedAt"
  | "submitter"
>;

export type TrustedSubmittedPost = Omit<Post, "published" | "submitter">;

export interface EditDraftPostInput {
  id: string;
  browserCapability: BrowserCapability;
  title?: string;
  description?: string;
  type?: PostType;
}

export interface WithdrawDraftPostInput {
  id: string;
  browserCapability: BrowserCapability;
}

export type GetDraftPostInput = WithdrawDraftPostInput;

export interface PublicPostQuery {
  cursor?: string;
  type?: PostType;
  status?: PostStatus;
  types?: PostType[];
  statuses?: PostStatus[];
  search?: string;
  sort?: "trending" | "top" | "new";
}

export interface PublicPostPage {
  items: PublicPost[];
  nextCursor?: string;
}

export type RoadmapStatus = Extract<
  PostStatus,
  "Planned" | "In Progress" | "Shipped"
>;

export interface PublicRoadmapPage {
  items: PublicPost[];
  nextCursor?: string;
  totalCount: number;
}

export interface PublicRoadmapQuery {
  status: RoadmapStatus;
  cursor?: string;
}

export type PublicPostRoadmap = Record<RoadmapStatus, PublicRoadmapPage>;

const roadmapStatuses = [
  "Planned",
  "In Progress",
  "Shipped",
] as const satisfies readonly RoadmapStatus[];

let postCreationQueue: Promise<void> = Promise.resolve();

class InMemoryFeedbackStorage implements FeedbackStorage {
  readonly #items: Map<string, StoredPost>;

  constructor(initialItems: StoredPost[] = []) {
    this.#items = new Map(
      initialItems.map((item) => [item.id, structuredClone(item)]),
    );
  }

  async create(item: NewStoredPost): Promise<StoredPost> {
    return this.save({ ...item, id: randomUUID() });
  }

  async save(item: StoredPost): Promise<StoredPost> {
    this.#items.set(item.id, structuredClone(item));
    return structuredClone(item);
  }

  async find(id: string): Promise<StoredPost | undefined> {
    const item = this.#items.get(id);
    return item ? structuredClone(item) : undefined;
  }

  async findBySlug(slug: string): Promise<StoredPost | undefined> {
    const item = [...this.#items.values()].find(
      (candidate) => candidate.slug === slug,
    );
    return item ? structuredClone(item) : undefined;
  }

  async findPublicBySlug(slug: string): Promise<StoredPost | undefined> {
    return this.findBySlug(slug);
  }

  async findByExternalId(externalId: string): Promise<StoredPost | undefined> {
    const item = [...this.#items.values()].find(
      (candidate) => candidate.externalId === externalId,
    );
    return item ? structuredClone(item) : undefined;
  }

  async list(): Promise<StoredPost[]> {
    return [...this.#items.values()].map((item) => structuredClone(item));
  }

  async listPublic(query: PublicPostQuery): Promise<{
    items: StoredPost[];
    nextCursor?: string;
  }> {
    const items = (await this.list())
      .filter(
        (item) =>
          item.published &&
          (!query.type || item.type === query.type) &&
          (!query.status || item.status === query.status) &&
          (!query.types?.length || query.types.includes(item.type)) &&
          (!query.statuses?.length || query.statuses.includes(item.status)) &&
          (!query.search ||
            `${item.title}\n${item.description}`
              .toLocaleLowerCase()
              .includes(query.search.toLocaleLowerCase())),
      )
      .sort(
        (left, right) =>
          right.createdAt.getTime() - left.createdAt.getTime() ||
          right.id.localeCompare(left.id),
      );
    const cursorId = query.cursor ? decodeCursor(query.cursor) : undefined;
    const cursorIndex = cursorId
      ? items.findIndex((item) => item.id === cursorId)
      : -1;
    const startIndex = cursorIndex + 1;
    const pageItems = items.slice(startIndex, startIndex + 25);
    const hasNextPage = startIndex + pageItems.length < items.length;
    const lastItem = pageItems.at(-1);
    return {
      items: pageItems,
      ...(hasNextPage && lastItem
        ? { nextCursor: encodeCursor(lastItem.id) }
        : {}),
    };
  }

  async listPublicRoadmap(query: PublicRoadmapQuery): Promise<{
    items: StoredPost[];
    nextCursor?: string;
    totalCount: number;
  }> {
    const items = (await this.list())
      .filter(isPublicPostRoadmapItem)
      .filter((item) => item.status === query.status)
      .sort(
        (left, right) =>
          right.updatedAt.getTime() - left.updatedAt.getTime() ||
          right.id.localeCompare(left.id),
      );
    const cursorId = query.cursor ? decodeCursor(query.cursor) : undefined;
    const cursorIndex = cursorId
      ? items.findIndex((item) => item.id === cursorId)
      : -1;
    const startIndex = cursorIndex + 1;
    const pageItems = items.slice(startIndex, startIndex + 25);
    const hasNextPage = startIndex + pageItems.length < items.length;
    const lastItem = pageItems.at(-1);
    return {
      items: pageItems,
      ...(hasNextPage && lastItem
        ? { nextCursor: encodeCursor(lastItem.id) }
        : {}),
      totalCount: items.length,
    };
  }

  async remove(id: string): Promise<void> {
    this.#items.delete(id);
  }
}

export interface FeedbackModule {
  submitPost(input: SubmitPostInput): Promise<SubmittedPost>;
  editDraftPost(input: EditDraftPostInput): Promise<Post>;
  getPublicPost(slug: string): Promise<PublicPost | undefined>;
  getDraftPost(input: GetDraftPostInput): Promise<DraftPost>;
  listPublicPosts(query?: PublicPostQuery): Promise<PublicPostPage>;
  listPublicRoadmapPosts(query: PublicRoadmapQuery): Promise<PublicRoadmapPage>;
  submitTrustedPost(
    input: SubmitTrustedPostInput,
  ): Promise<TrustedSubmittedPost>;
  withdrawDraftPost(input: WithdrawDraftPostInput): Promise<void>;
  getPublicPostRoadmap(): Promise<PublicPostRoadmap>;
}

export type FeedbackMutationModule = Pick<
  FeedbackModule,
  "submitPost" | "editDraftPost" | "withdrawDraftPost"
>;

interface CreateFeedbackModuleOptions {
  initialItems?: StoredPost[];
  storage?: FeedbackStorage;
}

export function createFeedbackModule(
  options: CreateFeedbackModuleOptions = {},
): FeedbackModule {
  const storage =
    options.storage ?? new InMemoryFeedbackStorage(options.initialItems);
  const editStoredDraft = async (input: EditDraftPostInput) => {
    const item = await storage.find(input.id);

    if (!authorizesDraft(item, input.browserCapability)) {
      throw new BrowserCapabilityAuthorizationError();
    }

    return storage.save({
      ...item,
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      ...(input.type === undefined ? {} : { type: input.type }),
      updatedAt: new Date(),
    });
  };
  const listPublicRoadmapPosts = async (
    query: PublicRoadmapQuery,
  ): Promise<PublicRoadmapPage> => {
    const page = await storage.listPublicRoadmap(query);
    return {
      items: page.items.map((item) => toPublicPost(toPost(item))),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      totalCount: page.totalCount,
    };
  };

  return {
    submitPost(input) {
      const submission = postCreationQueue.then(async () => {
        const now = new Date();
        const browserCapability = createBrowserCapability();
        const slug = await createUniqueSlug(input.title, storage);
        const item = await storage.create({
          ...input,
          slug,
          status: "New",
          published: false,
          createdAt: now,
          updatedAt: now,
          browserCapabilityHash: hashBrowserCapability(browserCapability),
        });

        return {
          ...toPost(item),
          browserCapability,
        };
      });
      postCreationQueue = submission.then(
        () => undefined,
        () => undefined,
      );
      return submission;
    },
    async editDraftPost(input) {
      return toPost(await editStoredDraft(input));
    },
    async getPublicPost(slug) {
      const item = await storage.findPublicBySlug(slug);
      return item?.published ? toPublicPost(toPost(item)) : undefined;
    },
    async getDraftPost(input) {
      const item = await storage.find(input.id);
      if (!authorizesDraft(item, input.browserCapability)) {
        throw new BrowserCapabilityAuthorizationError();
      }
      return toDraftPost(toPost(item));
    },
    async listPublicPosts(query = {}) {
      const page = await storage.listPublic(query);
      return {
        items: page.items.map((item) => toPublicPost(toPost(item))),
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      };
    },
    listPublicRoadmapPosts,
    async submitTrustedPost(input) {
      const existingItem = await storage.findByExternalId(input.externalId);
      if (existingItem) return toTrustedSubmittedPost(existingItem);

      const now = new Date();
      const slug = await createUniqueSlug(input.title, storage);
      const item = await storage.create({
        title: input.title,
        slug,
        description: input.description,
        type: input.type,
        ...(input.submitter ? { submitter: input.submitter } : {}),
        status: "New",
        published: false,
        createdAt: now,
        updatedAt: now,
        source: "API",
        externalId: input.externalId,
      });
      return toTrustedSubmittedPost(item);
    },
    async withdrawDraftPost(input) {
      const item = await storage.find(input.id);

      if (!authorizesDraft(item, input.browserCapability)) {
        throw new BrowserCapabilityAuthorizationError();
      }

      await storage.remove(item.id);
    },
    async getPublicPostRoadmap() {
      const pages = await Promise.all(
        roadmapStatuses.map((status) => listPublicRoadmapPosts({ status })),
      );
      return Object.fromEntries(
        roadmapStatuses.map((status, index) => [status, pages[index]]),
      ) as PublicPostRoadmap;
    },
  };
}

export function createNotionFeedbackModule(
  options: NotionFeedbackStorageOptions,
): FeedbackModule {
  return createFeedbackModule({
    storage: createNotionFeedbackStorage(options),
  });
}

function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, "base64url").toString("utf8");
}

function toPost(item: StoredPost): Post {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    description: item.description,
    type: item.type,
    ...(item.submitter === undefined ? {} : { submitter: item.submitter }),
    status: item.status,
    published: item.published,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toPublicPost(post: Post): PublicPost {
  return {
    slug: post.slug,
    title: post.title,
    description: post.description,
    type: post.type,
    status: post.status,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

function toDraftPost(post: Post): DraftPost {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    description: post.description,
    type: post.type,
    status: post.status,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    ...(post.submitter ? { submitter: { ...post.submitter } } : {}),
  };
}

async function createUniqueSlug(
  title: string,
  storage: FeedbackStorage,
): Promise<string> {
  const baseSlug =
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "post";

  let slug = baseSlug;
  let suffix = 2;
  while (await storage.findBySlug(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

function toTrustedSubmittedPost(item: Post): TrustedSubmittedPost {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    description: item.description,
    type: item.type,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function createBrowserCapability(): BrowserCapability {
  return randomBytes(32).toString("base64url") as BrowserCapability;
}

function hashBrowserCapability(browserCapability: BrowserCapability): string {
  return createHash("sha256").update(browserCapability).digest("base64url");
}

function authorizesDraft(
  item: StoredPost | undefined,
  browserCapability: BrowserCapability,
): item is StoredPost & { browserCapabilityHash: string } {
  if (!item?.browserCapabilityHash || item.status !== "New" || item.published) {
    return false;
  }

  const storedHash = Buffer.from(item.browserCapabilityHash);
  const presentedHash = Buffer.from(hashBrowserCapability(browserCapability));

  return (
    storedHash.length === presentedHash.length &&
    timingSafeEqual(storedHash, presentedHash)
  );
}

function isPublicPostRoadmapItem<Item extends Post>(
  item: Item,
): item is Item & { status: RoadmapStatus } {
  return (
    item.published &&
    (item.status === "Planned" ||
      item.status === "In Progress" ||
      item.status === "Shipped")
  );
}
