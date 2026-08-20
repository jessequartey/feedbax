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
  listPublic(): Promise<PublicFeedbackItem[]>;
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
    async listPublic() {
      const items = await storage.list();

      return items.filter((item) => item.published).map(toPublicFeedbackItem);
    },
  };
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
