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

interface FeedbackStorage {
  save(item: FeedbackItem): Promise<void>;
}

class InMemoryFeedbackStorage implements FeedbackStorage {
  readonly #items = new Map<string, FeedbackItem>();

  async save(item: FeedbackItem): Promise<void> {
    this.#items.set(item.id, item);
  }
}

export interface FeedbackModule {
  submit(input: SubmitFeedbackInput): Promise<FeedbackItem>;
}

export function createFeedbackModule(): FeedbackModule {
  const storage: FeedbackStorage = new InMemoryFeedbackStorage();

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

      return item;
    },
  };
}
