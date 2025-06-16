/**
 * API-specific types and interfaces
 * Types for API requests, responses, and server-side operations
 */

import { FeedbackPost, FeedbackComment, FeedbackVote, FeedbackFilters, SortOptions } from "./feedback";

// API Request types
export interface CreateFeedbackRequest {
  title: string;
  description?: string;
  type: "feature" | "bug" | "improvement" | "question";
  tags?: string[];
  authorId?: string;
  authorName: string;
  authorAvatar?: string;
}

export interface UpdateFeedbackRequest {
  id: string;
  title?: string;
  description?: string;
  type?: "feature" | "bug" | "improvement" | "question";
  status?: "backlog" | "next-up" | "in-progress" | "under-review" | "done" | "cancelled";
  priority?: "low" | "medium" | "high" | "critical";
  tags?: string[];
}

export interface CreateCommentRequest {
  postId: string;
  content: string;
  parentId?: string;
  authorId?: string;
  authorName: string;
  authorAvatar?: string;
}

export interface VoteRequest {
  postId: string;
  userId: string;
  type: "upvote" | "downvote";
}

export interface GetFeedbackRequest {
  page?: number;
  limit?: number;
  filters?: FeedbackFilters;
  sort?: SortOptions;
}

// API Response types
export interface FeedbackListResponse {
  posts: FeedbackPost[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  filters?: FeedbackFilters;
  sort?: SortOptions;
}

export interface FeedbackDetailResponse {
  post: FeedbackPost;
  comments: FeedbackComment[];
  relatedPosts?: FeedbackPost[];
}

export interface VoteResponse {
  success: boolean;
  newVoteCount: number;
  userVote?: "upvote" | "downvote" | null;
}

// Webhook types
export interface NotionWebhookPayload {
  object: "event";
  id: string;
  created_time: string;
  last_edited_time: string;
  created_by: {
    object: "user";
    id: string;
  };
  last_edited_by: {
    object: "user";
    id: string;
  };
  parent: {
    type: "database_id";
    database_id: string;
  };
  properties: Record<string, any>;
}

export interface WebhookEvent {
  type: "page.created" | "page.updated" | "page.deleted";
  data: NotionWebhookPayload;
  timestamp: string;
}

// Error response types
export interface ApiError {
  error: string;
  message: string;
  code?: string;
  details?: Record<string, any>;
  timestamp: string;
}

// Batch operation types
export interface BatchUpdateRequest {
  operations: Array<{
    type: "create" | "update" | "delete";
    data: CreateFeedbackRequest | UpdateFeedbackRequest | { id: string };
  }>;
}

export interface BatchUpdateResponse {
  success: boolean;
  results: Array<{
    success: boolean;
    data?: FeedbackPost;
    error?: string;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

// Analytics types
export interface FeedbackAnalytics {
  totalPosts: number;
  postsByType: Record<string, number>;
  postsByStatus: Record<string, number>;
  totalVotes: number;
  totalComments: number;
  topTags: Array<{ tag: string; count: number }>;
  recentActivity: Array<{
    type: "post_created" | "post_updated" | "comment_added" | "vote_added";
    timestamp: string;
    postId: string;
    postTitle: string;
  }>;
  timeRange: {
    start: string;
    end: string;
  };
}

// Search types
export interface SearchRequest {
  query: string;
  filters?: FeedbackFilters;
  limit?: number;
  includeComments?: boolean;
}

export interface SearchResponse {
  posts: FeedbackPost[];
  comments?: FeedbackComment[];
  total: number;
  query: string;
  suggestions?: string[];
}

// Export/Import types
export interface ExportRequest {
  format: "json" | "csv" | "xlsx";
  filters?: FeedbackFilters;
  includeComments?: boolean;
  includeVotes?: boolean;
}

export interface ImportRequest {
  format: "json" | "csv";
  data: string | FeedbackPost[];
  options?: {
    skipDuplicates?: boolean;
    updateExisting?: boolean;
    validateData?: boolean;
  };
}

// Rate limiting types
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

// Cache types
export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache tags for invalidation
  revalidate?: boolean; // Whether to revalidate in background
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  tags: string[];
}

// Validation types
export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// Middleware types
export interface RequestContext {
  userId?: string;
  userRole?: "user" | "admin" | "moderator";
  rateLimitInfo?: RateLimitInfo;
  requestId: string;
  timestamp: string;
}

// Health check types
export interface HealthCheckResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  services: {
    notion: "up" | "down" | "degraded";
    database: "up" | "down" | "degraded";
    cache: "up" | "down" | "degraded";
  };
  version: string;
  uptime: number;
}
