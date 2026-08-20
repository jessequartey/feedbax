import type { FeedbackItem, PublicFeedbackQuery } from "./index";

export type StoredFeedbackItem = FeedbackItem &
  Record<string, unknown> & {
    browserCapabilityHash?: string;
  };

export type NewStoredFeedbackItem = Omit<FeedbackItem, "id"> &
  Record<string, unknown> & {
    browserCapabilityHash?: string;
  };

export interface FeedbackStorage {
  create(item: NewStoredFeedbackItem): Promise<StoredFeedbackItem>;
  save(item: StoredFeedbackItem): Promise<StoredFeedbackItem>;
  find(id: string): Promise<StoredFeedbackItem | undefined>;
  findPublic(id: string): Promise<StoredFeedbackItem | undefined>;
  list(): Promise<StoredFeedbackItem[]>;
  listPublic(query: PublicFeedbackQuery): Promise<{
    items: StoredFeedbackItem[];
    nextCursor?: string;
  }>;
  listPublicRoadmap(): Promise<StoredFeedbackItem[]>;
  remove(id: string): Promise<void>;
}
