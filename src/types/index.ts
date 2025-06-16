/**
 * Type Definitions Index
 * 
 * Central export point for all type definitions used throughout the application.
 * This file provides a clean interface for importing types and ensures consistency.
 */

// Core feedback types
export type {
  // Base types
  PostType,
  PostStatus,
  PostPriority,
  VoteType,
  
  // Main interfaces
  FeedbackPost,
  FeedbackComment,
  FeedbackVote,
  FeedbackUser,
  
  // Roadmap types
  RoadmapColumn,
  RoadmapData,
  
  // Changelog types
  ChangelogEntry,
  ChangelogChange,
  
  // Response types
  ApiResponse,
  PaginatedResponse,
  
  // Filter and search types
  FeedbackFilters,
  SortOptions,
  
  // Notion integration types
  NotionFeedbackPage,
  NotionDatabaseSchema,
  
  // Data transformation types
  DataTransformOptions,
  
  // Error types
  FeedbackError,
  
  // Configuration types
  FeedbackConfig,
} from './feedback';

// API types
export type {
  // Request types
  CreateFeedbackRequest,
  UpdateFeedbackRequest,
  CreateCommentRequest,
  VoteRequest,
  GetFeedbackRequest,
  
  // Response types
  FeedbackListResponse,
  FeedbackDetailResponse,
  VoteResponse,
  
  // Webhook types
  NotionWebhookPayload,
  WebhookEvent,
  
  // Error response types
  ApiError,
  
  // Batch operation types
  BatchUpdateRequest,
  BatchUpdateResponse,
  
  // Analytics types
  FeedbackAnalytics,
  
  // Search types
  SearchRequest,
  SearchResponse,
  
  // Export/Import types
  ExportRequest,
  ImportRequest,
  
  // Rate limiting types
  RateLimitInfo,
  
  // Cache types
  CacheOptions,
  CacheEntry,
  
  // Validation types
  ValidationError,
  ValidationResult,
  
  // Middleware types
  RequestContext,
  
  // Health check types
  HealthCheckResponse,
} from './api';

// Notion types
export type {
  // Base Notion types
  NotionPage,
  NotionDatabase,
  NotionUser,
  
  // Property types
  NotionProperty,
  NotionTitleProperty,
  NotionRichTextProperty,
  NotionNumberProperty,
  NotionSelectProperty,
  NotionMultiSelectProperty,
  NotionDateProperty,
  NotionPeopleProperty,
  NotionFilesProperty,
  NotionCheckboxProperty,
  NotionUrlProperty,
  NotionEmailProperty,
  NotionPhoneNumberProperty,
  NotionFormulaProperty,
  NotionRelationProperty,
  NotionRollupProperty,
  NotionCreatedTimeProperty,
  NotionCreatedByProperty,
  NotionLastEditedTimeProperty,
  NotionLastEditedByProperty,
  
  // Property definition types
  NotionPropertyDefinition,
  
  // Supporting types
  NotionRichText,
  NotionSelectOption,
  NotionDateObject,
  NotionFile,
  NotionIcon,
  NotionParent,
  
  // API response types
  NotionListResponse,
  NotionQueryDatabaseResponse,
  
  // Error types
  NotionError,
  
  // Filter and sort types
  NotionFilter,
  NotionCompoundFilter,
  NotionSort,
  NotionQueryDatabaseParams,
} from './notion';

/**
 * Utility type helpers
 */

// Make all properties optional
export type Partial<T> = {
  [P in keyof T]?: T[P];
};

// Make all properties required
export type Required<T> = {
  [P in keyof T]-?: T[P];
};

// Pick specific properties
export type Pick<T, K extends keyof T> = {
  [P in K]: T[P];
};

// Omit specific properties
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

// Extract keys of a type
export type KeysOf<T> = keyof T;

// Extract values of a type
export type ValuesOf<T> = T[keyof T];

// Make specific properties optional
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Make specific properties required
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * Common utility types for the application
 */

// ID type for consistent identification
export type ID = string;

// Timestamp type for consistent date handling
export type Timestamp = string;

// URL type for consistent URL handling
export type URL = string;

// Email type for consistent email handling
export type Email = string;

// Generic success/error response
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

// Async result type
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

// Event handler type
export type EventHandler<T = void> = (event: T) => void;

// Async event handler type
export type AsyncEventHandler<T = void> = (event: T) => Promise<void>;

// Component props with children
export type PropsWithChildren<P = {}> = P & {
  children?: React.ReactNode;
};

// Component props with className
export type PropsWithClassName<P = {}> = P & {
  className?: string;
};

// Component ref type
export type ComponentRef<T> = React.Ref<T>;

// HTML element props
export type HTMLElementProps<T extends HTMLElement> = React.HTMLAttributes<T>;

// Form event handler
export type FormEventHandler = React.FormEventHandler<HTMLFormElement>;

// Input change handler
export type InputChangeHandler = React.ChangeEventHandler<HTMLInputElement>;

// Button click handler
export type ButtonClickHandler = React.MouseEventHandler<HTMLButtonElement>;

/**
 * Environment and configuration types
 */

// Environment type
export type Environment = 'development' | 'production' | 'test';

// Theme type
export type Theme = 'light' | 'dark' | 'system';

// Locale type
export type Locale = 'en' | 'es' | 'fr' | 'de' | 'ja' | 'zh';

/**
 * Database and API types
 */

// Generic database entity
export interface BaseEntity {
  id: ID;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// Generic API response
export interface BaseApiResponse {
  success: boolean;
  message?: string;
  timestamp: Timestamp;
}

// Generic paginated request
export interface BasePaginatedRequest {
  page?: number;
  limit?: number;
}

// Generic paginated response
export interface BasePaginatedResponse<T> {
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

/**
 * Error handling types
 */

// Generic error interface
export interface BaseError {
  code: string;
  message: string;
  timestamp: Timestamp;
  details?: Record<string, any>;
}

// Error severity levels
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

// Error categories
export type ErrorCategory = 
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'not_found'
  | 'conflict'
  | 'rate_limit'
  | 'external_service'
  | 'internal'
  | 'network'
  | 'timeout';

/**
 * Feature flag types
 */

// Feature flag configuration
export interface FeatureFlag {
  enabled: boolean;
  rolloutPercentage?: number;
  conditions?: Record<string, any>;
}

// Feature flags map
export type FeatureFlags = Record<string, FeatureFlag>;

/**
 * Analytics and metrics types
 */

// Metric value type
export type MetricValue = number | string | boolean;

// Metric data point
export interface MetricDataPoint {
  timestamp: Timestamp;
  value: MetricValue;
  tags?: Record<string, string>;
}

// Analytics event
export interface AnalyticsEvent {
  name: string;
  properties?: Record<string, MetricValue>;
  timestamp?: Timestamp;
  userId?: ID;
  sessionId?: ID;
}

/**
 * Re-export commonly used React types
 */
export type {
  ReactNode,
  ReactElement,
  ComponentType,
  FC,
  PropsWithChildren as ReactPropsWithChildren,
} from 'react';
