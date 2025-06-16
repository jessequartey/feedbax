"use client";

import { useState, useCallback, useMemo } from "react";
import { FeedbackHeader } from "./header";
import { FeedbackSidebar } from "./feedback-sidebar";
import { FeedbackList } from "./feedback-list";
import { CreatePostModal } from "./create-post-modal";
import { PostDetailModal } from "./post-detail-modal";
import { FeedbackWelcome } from "./feedback-welcome";
import type { FeedbackPost, PostStatus } from "@/types/feedback";

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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<FeedbackPost | null>(null);
  const [sortBy, setSortBy] = useState<"top" | "new" | "trending">("top");

  // Memoized filtered posts for performance
  const filteredPosts = useMemo(() => {
    return posts;
  }, [posts]);

  // Event handlers with useCallback for performance

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

  return (
    <div className="min-h-screen bg-background">
      <FeedbackHeader />

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
