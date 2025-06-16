"use client";

import {
  Search,
  TrendingUp,
  Clock,
  Flame,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FeedbackPost } from "@/types/feedback";
import { PostCard } from "./post-card";
import { useState, useCallback, useMemo } from "react";

/**
 * FeedbackList Component Props
 */
interface FeedbackListProps {
  /** Array of feedback posts to display */
  posts: FeedbackPost[];
  /** Current sort option */
  sortBy: "top" | "new" | "trending";
  /** Function to update sort option */
  setSortBy: (sort: "top" | "new" | "trending") => void;
  /** Function to trigger create post modal */
  onCreatePost: () => void;
  /** Function to handle post click */
  onPostClick: (post: FeedbackPost) => void;
  /** Optional search functionality */
  enableSearch?: boolean;
  /** Optional loading state */
  isLoading?: boolean;
}

/**
 * FeedbackList Component
 *
 * Displays a list of feedback posts with search, filtering, and sorting capabilities.
 * Provides an interface for users to browse and interact with feedback items.
 *
 * Features:
 * - Search functionality with real-time filtering
 * - Multiple sorting options (top, new, trending)
 * - Responsive design with proper loading states
 * - Accessibility support with proper ARIA labels
 *
 * @param props - Component props
 * @returns JSX.Element The feedback list interface
 */
export function FeedbackList({
  posts,
  sortBy,
  setSortBy,
  onCreatePost,
  onPostClick,
  enableSearch = true,
  isLoading = false,
}: FeedbackListProps) {
  // Local state for search functionality
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredPosts, setFilteredPosts] = useState(posts);

  // Filter posts based on search query
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);

      if (!query.trim()) {
        setFilteredPosts(posts);
        return;
      }

      const searchLower = query.toLowerCase();
      const filtered = posts.filter(
        (post) =>
          post.title.toLowerCase().includes(searchLower) ||
          post.description?.toLowerCase().includes(searchLower) ||
          post.tags?.some((tag) => tag.toLowerCase().includes(searchLower)) ||
          post.author.toLowerCase().includes(searchLower)
      );

      setFilteredPosts(filtered);
    },
    [posts]
  );

  // Update filtered posts when posts change
  useMemo(() => {
    if (!searchQuery.trim()) {
      setFilteredPosts(posts);
    } else {
      handleSearch(searchQuery);
    }
  }, [posts, searchQuery, handleSearch]);

  // Sort button configuration
  const sortOptions = useMemo(
    () => [
      {
        key: "top" as const,
        label: "Top",
        icon: TrendingUp,
        description: "Sort by most upvoted",
      },
      {
        key: "new" as const,
        label: "New",
        icon: Clock,
        description: "Sort by most recent",
      },
      {
        key: "trending" as const,
        label: "Trending",
        icon: Flame,
        description: "Sort by trending posts",
      },
    ],
    []
  );

  // Get current sort option details
  const currentSortOption = useMemo(() => {
    return (
      sortOptions.find((option) => option.key === sortBy) || sortOptions[0]
    );
  }, [sortOptions, sortBy]);

  // Handle sort button click
  const handleSortChange = useCallback(
    (sort: "top" | "new" | "trending") => {
      setSortBy(sort);
    },
    [setSortBy]
  );

  // Handle search input change
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleSearch(e.target.value);
    },
    [handleSearch]
  );

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setFilteredPosts(posts);
  }, [posts]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-10 w-64 bg-muted animate-pulse rounded-md" />
          <div className="flex space-x-2">
            <div className="h-9 w-32 bg-muted animate-pulse rounded-md" />
            <div className="h-9 w-24 bg-muted animate-pulse rounded-md" />
          </div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Search */}
        {enableSearch && (
          <div className="relative flex-1 max-w-md">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              placeholder="Search feedback..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="pl-10"
              aria-label="Search feedback posts"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                onClick={handleClearSearch}
                aria-label="Clear search"
              >
                ×
              </Button>
            )}
          </div>
        )}

        {/* Sort and Create */}
        <div className="flex items-center space-x-3">
          {/* Sort Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center space-x-2"
                aria-label="Sort options"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {currentSortOption.label}
                </span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {sortOptions.map(({ key, label, icon: Icon, description }) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => handleSortChange(key)}
                  className={`flex items-center space-x-2 ${
                    sortBy === key ? "bg-accent" : ""
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <div className="flex flex-col">
                    <span className="font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground">
                      {description}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Create post button */}
          <Button onClick={onCreatePost} aria-label="Create new feedback post">
            Create Post
          </Button>
        </div>
      </div>

      {/* Results summary */}
      {enableSearch && searchQuery && (
        <div className="text-sm text-muted-foreground">
          {filteredPosts.length === 0 ? (
            <span>No posts found for &quot;{searchQuery}&quot;</span>
          ) : (
            <span>
              {filteredPosts.length} post{filteredPosts.length !== 1 ? "s" : ""}{" "}
              found for &quot;{searchQuery}&quot;
            </span>
          )}
        </div>
      )}

      {/* Posts */}
      <div className="space-y-4" role="list" aria-label="Feedback posts">
        {filteredPosts.length > 0 ? (
          filteredPosts.map((post) => (
            <div key={post.id} role="listitem">
              <PostCard post={post} onClick={() => onPostClick(post)} />
            </div>
          ))
        ) : (
          <div className="text-center py-12">
            <div className="text-muted-foreground text-lg mb-2">
              {searchQuery ? "No posts found" : "No feedback posts yet"}
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery
                ? "Try adjusting your search terms or clear the search to see all posts."
                : "Be the first to share your feedback and help improve the product!"}
            </p>
            {searchQuery ? (
              <Button variant="outline" onClick={handleClearSearch}>
                Clear search
              </Button>
            ) : (
              <Button onClick={onCreatePost}>Create first post</Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
