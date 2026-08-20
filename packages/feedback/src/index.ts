import { randomUUID } from "node:crypto";

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

type StoredFeedbackItem = FeedbackItem & Record<string, unknown>;

interface FeedbackStorage {
  save(item: FeedbackItem): Promise<void>;
  list(): Promise<FeedbackItem[]>;
}

class InMemoryFeedbackStorage implements FeedbackStorage {
  readonly #items: Map<string, FeedbackItem>;

  constructor(initialItems: StoredFeedbackItem[] = []) {
    this.#items = new Map(
      initialItems.map((item) => [item.id, structuredClone(item)]),
    );
  }

  async save(item: FeedbackItem): Promise<void> {
    this.#items.set(item.id, structuredClone(item));
  }

  async list(): Promise<FeedbackItem[]> {
    return [...this.#items.values()].map((item) => structuredClone(item));
  }
}

export interface FeedbackModule {
  submit(input: SubmitFeedbackInput): Promise<FeedbackItem>;
  listPublic(query?: PublicFeedbackQuery): Promise<PublicFeedbackPage>;
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
      const item: FeedbackItem = {
        ...input,
        id: randomUUID(),
        status: "New",
        published: false,
        createdAt: now,
        updatedAt: now,
      };

      await storage.save(item);

      return structuredClone(item);
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
