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
  NewStoredFeedbackItem,
  NewStoredPost,
  StoredFeedbackItem,
  StoredPost,
} from "./feedback-storage";

export {
  createNotionFeedbackDataSource,
  validateNotionFeedbackDataSource,
  type FeedbackDataSourceConfiguration,
  type FeedbackPropertyIds,
} from "./notion-data-source";

export type FeedbackType =
  "Feature Request" | "Bug Report" | "General Feedback";

export type FeedbackStatus =
  "New" | "Reviewing" | "Planned" | "In Progress" | "Shipped" | "Closed";

export type PostType = FeedbackType;
export type PostStatus = FeedbackStatus;

export interface SubmitPostInput {
  title: string;
  description: string;
  type: PostType;
  submitter?: {
    name?: string;
    email?: string;
  };
}

export interface SubmitFeedbackInput {
  title: string;
  description: string;
  type: FeedbackType;
  submitter?: {
    name?: string;
    email?: string;
  };
}

export interface SubmitTrustedFeedbackInput extends SubmitFeedbackInput {
  externalId: string;
}

export interface FeedbackItem extends SubmitFeedbackInput {
  id: string;
  status: FeedbackStatus;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
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

export type SubmittedFeedbackItem = FeedbackItem & {
  browserCapability: BrowserCapability;
};

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

export type TrustedSubmittedFeedbackItem = Omit<
  FeedbackItem,
  "published" | "submitter"
>;

export interface EditDraftInput {
  id: string;
  browserCapability: BrowserCapability;
  title?: string;
  description?: string;
  type?: FeedbackType;
  submitter?: {
    name?: string;
    email?: string;
  };
}

export interface WithdrawDraftInput {
  id: string;
  browserCapability: BrowserCapability;
}

export type EditDraftPostInput = Omit<EditDraftInput, "submitter">;
export type GetDraftPostInput = WithdrawDraftInput;

export type PublicFeedbackItem = Pick<
  FeedbackItem,
  "id" | "title" | "description" | "type" | "status" | "createdAt" | "updatedAt"
>;

export interface PublicFeedbackQuery {
  cursor?: string;
  type?: FeedbackType;
  status?: FeedbackStatus;
  types?: FeedbackType[];
  statuses?: FeedbackStatus[];
  search?: string;
  sort?: "trending" | "top" | "new";
}

export interface PublicPostPage {
  items: PublicPost[];
  nextCursor?: string;
}

export interface PublicFeedbackPage {
  items: PublicFeedbackItem[];
  nextCursor?: string;
}

export type RoadmapStatus = Extract<
  FeedbackStatus,
  "Planned" | "In Progress" | "Shipped"
>;

export type PublicRoadmap = Record<RoadmapStatus, PublicFeedbackItem[]>;
export type PublicPostRoadmap = Record<RoadmapStatus, PublicPost[]>;

let postCreationQueue: Promise<void> = Promise.resolve();

class InMemoryFeedbackStorage implements FeedbackStorage {
  readonly #items: Map<string, StoredFeedbackItem>;

  constructor(initialItems: StoredFeedbackItem[] = []) {
    this.#items = new Map(
      initialItems.map((item) => [item.id, structuredClone(item)]),
    );
  }

  async create(item: NewStoredFeedbackItem): Promise<StoredFeedbackItem> {
    return this.save({ ...item, id: randomUUID() });
  }

  async createPost(item: NewStoredPost): Promise<StoredPost> {
    return this.save({ ...item, id: randomUUID() }) as Promise<StoredPost>;
  }

  async save(item: StoredFeedbackItem): Promise<StoredFeedbackItem> {
    this.#items.set(item.id, structuredClone(item));
    return structuredClone(item);
  }

  async find(id: string): Promise<StoredFeedbackItem | undefined> {
    const item = this.#items.get(id);
    return item ? structuredClone(item) : undefined;
  }

  async findBySlug(slug: string): Promise<StoredFeedbackItem | undefined> {
    const item = [...this.#items.values()].find(
      (candidate) => candidate.slug === slug,
    );
    return item ? structuredClone(item) : undefined;
  }

  async findPublicBySlug(
    slug: string,
  ): Promise<StoredFeedbackItem | undefined> {
    return this.findBySlug(slug);
  }

  async findPublic(id: string): Promise<StoredFeedbackItem | undefined> {
    return this.find(id);
  }

  async findByExternalId(
    externalId: string,
  ): Promise<StoredFeedbackItem | undefined> {
    const item = [...this.#items.values()].find(
      (candidate) => candidate.externalId === externalId,
    );
    return item ? structuredClone(item) : undefined;
  }

  async list(): Promise<StoredFeedbackItem[]> {
    return [...this.#items.values()].map((item) => structuredClone(item));
  }

  async listPublic(query: PublicFeedbackQuery): Promise<{
    items: StoredFeedbackItem[];
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

  async listPublicRoadmap(): Promise<StoredFeedbackItem[]> {
    return (await this.list())
      .filter(isPublicRoadmapItem)
      .sort(
        (left, right) =>
          right.updatedAt.getTime() - left.updatedAt.getTime() ||
          right.id.localeCompare(left.id),
      );
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
  listPublicPosts(query?: PublicFeedbackQuery): Promise<PublicPostPage>;
  submit(input: SubmitFeedbackInput): Promise<SubmittedFeedbackItem>;
  submitTrusted(
    input: SubmitTrustedFeedbackInput,
  ): Promise<TrustedSubmittedFeedbackItem>;
  editDraft(input: EditDraftInput): Promise<FeedbackItem>;
  withdrawDraft(input: WithdrawDraftInput): Promise<void>;
  getPublic(id: string): Promise<PublicFeedbackItem | undefined>;
  listPublic(query?: PublicFeedbackQuery): Promise<PublicFeedbackPage>;
  getPublicRoadmap(): Promise<PublicRoadmap>;
  getPublicPostRoadmap(): Promise<PublicPostRoadmap>;
}

export type FeedbackMutationModule = Pick<
  FeedbackModule,
  "submit" | "editDraft" | "withdrawDraft"
>;

interface CreateFeedbackModuleOptions {
  initialItems?: StoredFeedbackItem[];
  storage?: FeedbackStorage;
}

export function createFeedbackModule(
  options: CreateFeedbackModuleOptions = {},
): FeedbackModule {
  const storage =
    options.storage ?? new InMemoryFeedbackStorage(options.initialItems);
  const editStoredDraft = async (input: EditDraftInput) => {
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
      ...(input.submitter === undefined
        ? {}
        : { submitter: { ...item.submitter, ...input.submitter } }),
      updatedAt: new Date(),
    });
  };

  return {
    submitPost(input) {
      const submission = postCreationQueue.then(async () => {
        const now = new Date();
        const browserCapability = createBrowserCapability();
        const slug = await createUniqueSlug(input.title, storage);
        const item = await storage.createPost({
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
    async submit(input) {
      const now = new Date();
      const browserCapability = createBrowserCapability();
      const item = await storage.create({
        ...input,
        status: "New",
        published: false,
        createdAt: now,
        updatedAt: now,
        browserCapabilityHash: hashBrowserCapability(browserCapability),
      });

      return {
        ...toFeedbackItem(item),
        browserCapability,
      };
    },
    async submitTrusted(input) {
      const existingItem = await storage.findByExternalId(input.externalId);
      if (existingItem) return toTrustedSubmittedFeedbackItem(existingItem);

      const now = new Date();
      const item = await storage.create({
        title: input.title,
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
      return toTrustedSubmittedFeedbackItem(item);
    },
    async editDraft(input) {
      return toFeedbackItem(await editStoredDraft(input));
    },
    async withdrawDraft(input) {
      const item = await storage.find(input.id);

      if (!authorizesDraft(item, input.browserCapability)) {
        throw new BrowserCapabilityAuthorizationError();
      }

      await storage.remove(item.id);
    },
    async getPublic(id) {
      const item = await storage.findPublic(id);
      return item?.published ? toPublicFeedbackItem(item) : undefined;
    },
    async listPublic(query = {}) {
      const page = await storage.listPublic(query);

      return {
        items: page.items.map(toPublicFeedbackItem),
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      };
    },
    async getPublicRoadmap() {
      const roadmap: PublicRoadmap = {
        Planned: [],
        "In Progress": [],
        Shipped: [],
      };
      const items = await storage.listPublicRoadmap();

      for (const item of items) {
        if (isPublicRoadmapItem(item)) {
          roadmap[item.status].push(toPublicFeedbackItem(item));
        }
      }

      return roadmap;
    },
    async getPublicPostRoadmap() {
      const roadmap: PublicPostRoadmap = {
        Planned: [],
        "In Progress": [],
        Shipped: [],
      };
      for (const item of await storage.listPublicRoadmap())
        if (isPublicRoadmapItem(item))
          roadmap[item.status].push(toPublicPost(toPost(item)));
      return roadmap;
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

function toPublicFeedbackItem(item: FeedbackItem): PublicFeedbackItem {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    type: item.type,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toFeedbackItem(item: FeedbackItem): FeedbackItem {
  return {
    id: item.id,
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

function toPost(item: StoredFeedbackItem): Post {
  if (!item.slug) throw new Error("Stored Post is missing its slug.");
  return { ...toFeedbackItem(item), slug: item.slug };
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

function toTrustedSubmittedFeedbackItem(
  item: FeedbackItem,
): TrustedSubmittedFeedbackItem {
  return {
    id: item.id,
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
  item: StoredFeedbackItem | undefined,
  browserCapability: BrowserCapability,
): item is StoredFeedbackItem & { browserCapabilityHash: string } {
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

function isPublicRoadmapItem<Item extends FeedbackItem>(
  item: Item,
): item is Item & { status: RoadmapStatus } {
  return (
    item.published &&
    (item.status === "Planned" ||
      item.status === "In Progress" ||
      item.status === "Shipped")
  );
}
