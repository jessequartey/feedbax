import type { Post, PublicPostQuery } from "./index";

export type PostSource = "Portal" | "API";

export type StoredPost = Post &
  Partial<{
    browserCapabilityHash: string;
    source: PostSource;
    externalId: string;
  }> &
  Record<string, unknown>;

export type NewStoredPost = Omit<Post, "id"> &
  Partial<{
    browserCapabilityHash: string;
    source: PostSource;
    externalId: string;
  }> &
  Record<string, unknown>;

export interface FeedbackStorage {
  create(item: NewStoredPost): Promise<StoredPost>;
  save(item: StoredPost): Promise<StoredPost>;
  find(id: string): Promise<StoredPost | undefined>;
  findBySlug(slug: string): Promise<StoredPost | undefined>;
  findPublicBySlug(slug: string): Promise<StoredPost | undefined>;
  findByExternalId(externalId: string): Promise<StoredPost | undefined>;
  list(): Promise<StoredPost[]>;
  listPublic(query: PublicPostQuery): Promise<{
    items: StoredPost[];
    nextCursor?: string;
  }>;
  listPublicRoadmap(): Promise<StoredPost[]>;
  remove(id: string): Promise<void>;
}
