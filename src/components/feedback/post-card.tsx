"use client";

import { ChevronUp, MessageSquare, Lightbulb, Bug } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FeedbackPost, PostStatus } from "@/types/feedback";
import { useCallback, useMemo } from "react";

/**
 * PostCard Component Props
 */
interface PostCardProps {
  /** The feedback post data to display */
  post: FeedbackPost;
  /** Callback function when the card is clicked */
  onClick: () => void;
  /** Optional callback for upvote action */
  onUpvote?: (postId: string) => void;
  /** Whether the current user has upvoted this post */
  isUpvoted?: boolean;
  /** Whether upvoting is disabled */
  upvoteDisabled?: boolean;
}

/**
 * PostCard Component
 *
 * Displays a feedback post in a card format with voting, status, and metadata.
 * Provides interactive elements for upvoting and viewing post details.
 *
 * Features:
 * - Status badge with color coding
 * - Upvote functionality with visual feedback
 * - Post type indicators (feature/bug)
 * - Responsive design with hover effects
 * - Accessibility support with proper ARIA labels
 *
 * @param props - Component props
 * @returns JSX.Element The post card component
 */
export function PostCard({
  post,
  onClick,
  onUpvote,
  isUpvoted = false,
  upvoteDisabled = false
}: PostCardProps) {

  /**
   * Get status color classes based on post status
   * @param status - The post status
   * @returns CSS classes for status styling
   */
  const getStatusColor = useCallback((status: PostStatus): string => {
    switch (status) {
      case "backlog":
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      case "next-up":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "in-progress":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "under-review":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "done":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "cancelled":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  }, []);

  /**
   * Format large numbers with k suffix
   * @param num - The number to format
   * @returns Formatted number string
   */
  const formatNumber = useCallback((num: number): string => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + "k";
    }
    return num.toString();
  }, []);

  /**
   * Get the appropriate icon for post type
   */
  const PostTypeIcon = useMemo(() => {
    return post.type === "feature" ? Lightbulb : Bug;
  }, [post.type]);

  /**
   * Get the display text for post type
   */
  const postTypeText = useMemo(() => {
    return post.type === "feature" ? "Feature Request" : "Bug Report";
  }, [post.type]);

  /**
   * Handle upvote button click
   */
  const handleUpvote = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    if (onUpvote && !upvoteDisabled) {
      onUpvote(post.id);
    }
  }, [onUpvote, upvoteDisabled, post.id]);

  /**
   * Handle card click for keyboard navigation
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  }, [onClick]);

  return (
    <Card
      className="group p-5 hover:shadow-lg hover:shadow-primary/5 cursor-pointer transition-all duration-300 border border-border/50 hover:border-border bg-card/50 backdrop-blur-sm hover:bg-card/80 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 rounded-xl"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`View details for ${post.title}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* Status Badge */}
          <div className="flex items-center space-x-2 mb-2">
            <Badge
              className={getStatusColor(post.status)}
              aria-label={`Status: ${post.status}`}
            >
              {post.status.replace("-", " ").toUpperCase()}
            </Badge>
            {post.tags && post.tags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {post.tags.slice(0, 2).map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-xs"
                    aria-label={`Tag: ${tag}`}
                  >
                    {tag}
                  </Badge>
                ))}
                {post.tags.length > 2 && (
                  <Badge variant="outline" className="text-xs">
                    +{post.tags.length - 2}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Title */}
          <h3 className="font-semibold text-foreground mb-2 group-hover:text-primary transition-colors line-clamp-2 text-lg">
            {post.title}
          </h3>

          {/* Description */}
          {post.description && (
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
              {post.description}
            </p>
          )}

          {/* Metadata */}
          <div className="flex items-center space-x-4 text-sm text-muted-foreground flex-wrap gap-2">
            <div className="flex items-center space-x-1">
              <PostTypeIcon className="h-4 w-4" aria-hidden="true" />
              <span>{postTypeText}</span>
            </div>
            <time dateTime={post.createdAt} className="whitespace-nowrap">
              {post.createdAt}
            </time>
            <div className="flex items-center space-x-1">
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              <span>{post.comments} comment{post.comments !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>

        {/* Upvote Button */}
        <div className="flex flex-col items-center space-y-1 ml-4 flex-shrink-0">
          <Button
            variant={isUpvoted ? "default" : "ghost"}
            size="sm"
            className={`h-auto p-3 flex flex-col transition-all duration-200 rounded-xl hover:scale-105 ${
              isUpvoted 
                ? "bg-gradient-to-b from-primary to-primary/90 text-primary-foreground shadow-lg shadow-primary/25" 
                : "hover:bg-accent/50 border border-transparent hover:border-border/50"
            } ${upvoteDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
            onClick={handleUpvote}
            disabled={upvoteDisabled}
            aria-label={`${isUpvoted ? "Remove upvote from" : "Upvote"} ${post.title}. Current upvotes: ${post.upvotes}`}
          >
            <ChevronUp
              className={`h-4 w-4 transition-transform duration-200 ${
                isUpvoted ? "scale-110" : ""
              }`}
              aria-hidden="true"
            />
            <span className="text-xs font-bold">
              {formatNumber(post.upvotes)}
            </span>
          </Button>
        </div>
      </div>
    </Card>
  );
}
