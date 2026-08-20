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
  StoredFeedbackItem,
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

export type PublicFeedbackItem = Pick<
  FeedbackItem,
  "id" | "title" | "description" | "type" | "status" | "createdAt" | "updatedAt"
>;

export interface PublicFeedbackQuery {
  cursor?: string;
  type?: FeedbackType;
  status?: FeedbackStatus;
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

  async save(item: StoredFeedbackItem): Promise<StoredFeedbackItem> {
    this.#items.set(item.id, structuredClone(item));
    return structuredClone(item);
  }

  async find(id: string): Promise<StoredFeedbackItem | undefined> {
    const item = this.#items.get(id);
    return item ? structuredClone(item) : undefined;
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
          (!query.status || item.status === query.status),
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
  submit(input: SubmitFeedbackInput): Promise<SubmittedFeedbackItem>;
  submitTrusted(
    input: SubmitTrustedFeedbackInput,
  ): Promise<TrustedSubmittedFeedbackItem>;
  editDraft(input: EditDraftInput): Promise<FeedbackItem>;
  withdrawDraft(input: WithdrawDraftInput): Promise<void>;
  getPublic(id: string): Promise<PublicFeedbackItem | undefined>;
  listPublic(query?: PublicFeedbackQuery): Promise<PublicFeedbackPage>;
  getPublicRoadmap(): Promise<PublicRoadmap>;
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

  return {
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
      const item = await storage.find(input.id);

      if (!authorizesDraft(item, input.browserCapability)) {
        throw new BrowserCapabilityAuthorizationError();
      }

      const editedItem: StoredFeedbackItem = {
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
      };

      return toFeedbackItem(await storage.save(editedItem));
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
