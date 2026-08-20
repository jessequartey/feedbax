import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

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

export type SubmittedFeedbackItem = FeedbackItem & {
  browserCapability: BrowserCapability;
};

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
  "title" | "description" | "type" | "status" | "createdAt" | "updatedAt"
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

type StoredFeedbackItem = FeedbackItem &
  Record<string, unknown> & {
    browserCapabilityHash?: string;
  };

interface FeedbackStorage {
  save(item: StoredFeedbackItem): Promise<void>;
  list(): Promise<StoredFeedbackItem[]>;
  remove(id: string): Promise<void>;
}

class InMemoryFeedbackStorage implements FeedbackStorage {
  readonly #items: Map<string, StoredFeedbackItem>;

  constructor(initialItems: StoredFeedbackItem[] = []) {
    this.#items = new Map(
      initialItems.map((item) => [item.id, structuredClone(item)]),
    );
  }

  async save(item: StoredFeedbackItem): Promise<void> {
    this.#items.set(item.id, structuredClone(item));
  }

  async list(): Promise<StoredFeedbackItem[]> {
    return [...this.#items.values()].map((item) => structuredClone(item));
  }

  async remove(id: string): Promise<void> {
    this.#items.delete(id);
  }
}

export interface FeedbackModule {
  submit(input: SubmitFeedbackInput): Promise<SubmittedFeedbackItem>;
  editDraft(input: EditDraftInput): Promise<FeedbackItem>;
  withdrawDraft(input: WithdrawDraftInput): Promise<void>;
  listPublic(query?: PublicFeedbackQuery): Promise<PublicFeedbackPage>;
  getPublicRoadmap(): Promise<PublicRoadmap>;
}

interface CreateFeedbackModuleOptions {
  initialItems?: StoredFeedbackItem[];
}

export function createFeedbackModule(
  options: CreateFeedbackModuleOptions = {},
): FeedbackModule {
  const storage: FeedbackStorage = new InMemoryFeedbackStorage(
    options.initialItems,
  );

  return {
    async submit(input) {
      const now = new Date();
      const browserCapability = createBrowserCapability();
      const item: StoredFeedbackItem = {
        ...input,
        id: randomUUID(),
        status: "New",
        published: false,
        createdAt: now,
        updatedAt: now,
        browserCapabilityHash: hashBrowserCapability(browserCapability),
      };

      await storage.save(item);

      return {
        ...toFeedbackItem(item),
        browserCapability,
      };
    },
    async editDraft(input) {
      const item = (await storage.list()).find(
        (candidate) => candidate.id === input.id,
      );

      if (!authorizesDraft(item, input.browserCapability)) {
        throw new Error("Browser Capability did not authorize this draft.");
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

      await storage.save(editedItem);

      return toFeedbackItem(editedItem);
    },
    async withdrawDraft(input) {
      const item = (await storage.list()).find(
        (candidate) => candidate.id === input.id,
      );

      if (!authorizesDraft(item, input.browserCapability)) {
        throw new Error("Browser Capability did not authorize this draft.");
      }

      await storage.remove(item.id);
    },
    async listPublic(query = {}) {
      const items = (await storage.list())
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
        items: pageItems.map(toPublicFeedbackItem),
        ...(hasNextPage && lastItem
          ? { nextCursor: encodeCursor(lastItem.id) }
          : {}),
      };
    },
    async getPublicRoadmap() {
      const roadmap: PublicRoadmap = {
        Planned: [],
        "In Progress": [],
        Shipped: [],
      };
      const items = (await storage.list())
        .filter(isPublicRoadmapItem)
        .sort(
          (left, right) =>
            right.updatedAt.getTime() - left.updatedAt.getTime() ||
            right.id.localeCompare(left.id),
        );

      for (const item of items) {
        roadmap[item.status].push(toPublicFeedbackItem(item));
      }

      return roadmap;
    },
  };
}

function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, "base64url").toString("utf8");
}

function toPublicFeedbackItem(item: FeedbackItem): PublicFeedbackItem {
  return {
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
