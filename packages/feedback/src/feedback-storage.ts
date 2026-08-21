import type { FeedbackItem, Post, PublicFeedbackQuery } from "./index";

export type StoredFeedbackItem = FeedbackItem &
  Record<string, unknown> & {
    slug?: string;
    browserCapabilityHash?: string;
  };

export type NewStoredFeedbackItem = Omit<FeedbackItem, "id"> &
  Record<string, unknown> & {
    slug?: string;
    browserCapabilityHash?: string;
  };

export type StoredPost = StoredFeedbackItem & { slug: string };

export type NewStoredPost = Omit<Post, "id"> &
  Record<string, unknown> & {
    browserCapabilityHash: string;
  };

export interface FeedbackStorage {
  create(item: NewStoredFeedbackItem): Promise<StoredFeedbackItem>;
  createPost(item: NewStoredPost): Promise<StoredPost>;
  save(item: StoredFeedbackItem): Promise<StoredFeedbackItem>;
  find(id: string): Promise<StoredFeedbackItem | undefined>;
  findBySlug(slug: string): Promise<StoredFeedbackItem | undefined>;
  findPublicBySlug(slug: string): Promise<StoredFeedbackItem | undefined>;
  findByExternalId(externalId: string): Promise<StoredFeedbackItem | undefined>;
  findPublic(id: string): Promise<StoredFeedbackItem | undefined>;
  list(): Promise<StoredFeedbackItem[]>;
  listPublic(query: PublicFeedbackQuery): Promise<{
    items: StoredFeedbackItem[];
    nextCursor?: string;
  }>;
  listPublicRoadmap(): Promise<StoredFeedbackItem[]>;
  remove(id: string): Promise<void>;
}
