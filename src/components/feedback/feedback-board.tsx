"use client";

import { useState, useCallback, useMemo } from "react";
import { FeedbackHeader } from "./header";
import { FeedbackSidebar } from "./feedback-sidebar";
import { FeedbackList } from "./feedback-list";
import { CreatePostModal } from "./create-post-modal";
import { PostDetailModal } from "./post-detail-modal";
import { FeedbackWelcome } from "./feedback-welcome";
import { Badge } from "@/components/ui/badge";
import type { FeedbackPost, PostType, PostStatus } from "@/types/feedback";

interface FeedbackBoardProps {
  initialPosts: FeedbackPost[];
}

/**
 * FeedbackBoard Component
 *
 * Main component for displaying and managing feedback posts.
 * Provides functionality for viewing, filtering, and interacting with feedback items.
 *
 * Features:
 * - Filter posts by type (all, feature, bug)
 * - Sort posts by different criteria
 * - Create new feedback posts
 * - View detailed post information
 * - Responsive design with sidebar navigation
 *
 * @returns JSX.Element The feedback board interface
 */
export function FeedbackBoard({ initialPosts }: FeedbackBoardProps) {
  // State management
  const [posts, setPosts] = useState<FeedbackPost[]>(initialPosts);
  const [selectedBoard, setSelectedBoard] = useState<"all" | "feature" | "bug">(
    "all"
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<FeedbackPost | null>(null);
  const [sortBy, setSortBy] = useState<"top" | "new" | "trending">("top");

  // Memoized filtered posts for performance
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      if (selectedBoard === "all") return true;
      return post.type === selectedBoard;
    });
  }, [posts, selectedBoard]);

  // Event handlers with useCallback for performance
  const handleBoardChange = useCallback((board: "all" | "feature" | "bug") => {
    setSelectedBoard(board);
  }, []);

  const handleCreatePost = useCallback(() => {
    setIsCreateModalOpen(true);
  }, []);

  const handlePostClick = useCallback((post: FeedbackPost) => {
    setSelectedPost(post);
  }, []);

  const handleCloseCreateModal = useCallback(() => {
    setIsCreateModalOpen(false);
  }, []);

  const handleCloseDetailModal = useCallback(() => {
    setSelectedPost(null);
  }, []);

  const handleOptimisticUpdate = useCallback((updatedPosts: FeedbackPost[]) => {
    setPosts(updatedPosts);
  }, []);

  // Computed statistics for sidebar
  const postStats = useMemo(
    () => ({
      total: posts.length,
      features: posts.filter((p) => p.type === "feature").length,
      bugs: posts.filter((p) => p.type === "bug").length,
    }),
    [posts]
  );

  /**
   * Get status color classes for badges
   * @param status - The post status
   * @returns CSS classes for styling the status badge
   */
  const getStatusColor = useCallback((status: PostStatus) => {
    switch (status) {
      case "backlog":
        return "bg-muted text-muted-foreground";
      case "next-up":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
      case "in-progress":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300";
      case "under-review":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300";
      case "done":
        return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
      default:
        return "bg-muted text-muted-foreground";
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <FeedbackHeader
        selectedBoard={selectedBoard}
        onBoardChange={handleBoardChange}
      />

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <FeedbackWelcome />
            <FeedbackList
              posts={filteredPosts}
              sortBy={sortBy}
              setSortBy={setSortBy}
              onCreatePost={handleCreatePost}
              onPostClick={handlePostClick}
            />
          </div>

          <div className="lg:col-span-1">
            <FeedbackSidebar
              selectedBoard={selectedBoard}
              onBoardChange={handleBoardChange}
              totalPosts={postStats.total}
              featurePosts={postStats.features}
              bugPosts={postStats.bugs}
            />
          </div>
        </div>
      </div>

      <CreatePostModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        currentPosts={posts}
        onOptimisticUpdate={handleOptimisticUpdate}
      />

      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          isOpen={!!selectedPost}
          onClose={handleCloseDetailModal}
        />
      )}
    </div>
  );
}
