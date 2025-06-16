/**
 * Core feedback data types and interfaces
 * Centralized type definitions for Notion feedback data
 */

// Base types for feedback system
export type PostType = "feature" | "bug" | "improvement" | "question";

export type PostStatus =
  | "backlog"
  | "next-up"
  | "in-progress"
  | "under-review"
  | "done"
  | "cancelled";

export type PostPriority = "low" | "medium" | "high" | "critical";

export type VoteType = "upvote" | "downvote";

// Core feedback post interface
export interface FeedbackPost {
  id: string;
  title: string;
  description?: string;
  type: PostType;
  status: PostStatus;
  priority?: PostPriority;
  upvotes: number;
  downvotes?: number;
  comments: number;
  author: string;
  authorId?: string;
  avatar: string;
  createdAt: string;
  updatedAt?: string;
  tags?: string[];
  mergedInto?: string; // ID of post this was merged into
  duplicateOf?: string; // ID of original post if this is a duplicate
  notionPageId?: string; // Notion page ID for integration
  notionUrl?: string; // Direct link to Notion page
}

// Comment system types
export interface FeedbackComment {
  id: string;
  postId: string;
  content: string;
  author: string;
  authorId?: string;
  avatar?: string;
  createdAt: string;
  updatedAt?: string;
  parentId?: string; // For nested comments
  upvotes?: number;
  isAuthorResponse?: boolean; // If comment is from post author/admin
  notionBlockId?: string; // Notion block ID for integration
}

// Vote tracking
export interface FeedbackVote {
  id: string;
  postId: string;
  userId: string;
  type: VoteType;
  createdAt: string;
}

// User information
export interface FeedbackUser {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  role?: "user" | "admin" | "moderator";
  createdAt: string;
}

// Roadmap organization
export interface RoadmapColumn {
  id: string;
  title: string;
  status: PostStatus;
  description?: string;
  order: number;
  posts: FeedbackPost[];
}

export interface RoadmapData {
  columns: RoadmapColumn[];
  totalPosts: number;
  lastUpdated: string;
}

// Changelog types
export interface ChangelogEntry {
  id: string;
  version: string;
  date: string;
  title?: string;
  description?: string;
  changes: ChangelogChange[];
  relatedPosts?: string[]; // IDs of feedback posts related to this release
}

export interface ChangelogChange {
  id: string;
  type: PostType;
  description: string;
  relatedPostId?: string;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Filter and search types
export interface FeedbackFilters {
  type?: PostType[];
  status?: PostStatus[];
  priority?: PostPriority[];
  tags?: string[];
  author?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  search?: string;
}

export interface SortOptions {
  field: "createdAt" | "updatedAt" | "upvotes" | "comments" | "title";
  direction: "asc" | "desc";
}

// Notion integration types
export interface NotionFeedbackPage {
  id: string;
  title: string;
  description?: string;
  type: PostType;
  status: PostStatus;
  priority?: PostPriority;
  votes: number;
  submitter?: string;
  tags?: string[];
  createdTime: string;
  lastEditedTime: string;
  url: string;
}

export interface NotionDatabaseSchema {
  title: { type: "title" };
  description: { type: "rich_text" };
  type: { type: "select"; options: PostType[] };
  status: { type: "select"; options: PostStatus[] };
  priority: { type: "select"; options: PostPriority[] };
  votes: { type: "number" };
  submitter: { type: "rich_text" };
  tags: { type: "multi_select" };
  mergedInto: { type: "relation" };
}

// Data transformation utilities types
export interface DataTransformOptions {
  includeComments?: boolean;
  includeVotes?: boolean;
  includeAuthorDetails?: boolean;
  filterDeleted?: boolean;
}

// Error types
export interface FeedbackError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
}

// Configuration types
export interface FeedbackConfig {
  notion: {
    apiKey: string;
    databaseId: string;
    webhookSecret?: string;
  };
  features: {
    voting: boolean;
    comments: boolean;
    userAuth: boolean;
    realTimeUpdates: boolean;
  };
  ui: {
    theme: "light" | "dark" | "system";
    postsPerPage: number;
    enableMarkdown: boolean;
  };
}
