"use client";

import { useState } from "react";
import { FeedbackHeader } from "./feedback-header";
import { FeedbackSidebar } from "./feedback-sidebar";
import { FeedbackList } from "./feedback-list";
import { CreatePostModal } from "./create-post-modal";
import { PostDetailModal } from "./post-detail-modal";
import { FeedbackWelcome } from "./feedback-welcome";
import { feedbackPosts } from "@/content/feedback-content";
import { Badge } from "@/components/ui/badge";

export type PostType = "feature" | "bug";
export type PostStatus =
  | "backlog"
  | "next-up"
  | "in-progress"
  | "under-review"
  | "done";

export interface FeedbackPost {
  id: string;
  title: string;
  description?: string;
  type: PostType;
  status: PostStatus;
  upvotes: number;
  comments: number;
  author: string;
  avatar: string;
  createdAt: string;
  tags?: string[];
}

export function FeedbackBoard() {
  const [posts] = useState<FeedbackPost[]>(feedbackPosts);
  const [selectedBoard, setSelectedBoard] = useState<"all" | "feature" | "bug">(
    "all"
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<FeedbackPost | null>(null);
  const [sortBy, setSortBy] = useState<"top" | "new" | "trending">("top");

  const filteredPosts = posts.filter((post) => {
    if (selectedBoard === "all") return true;
    return post.type === selectedBoard;
  });

  const getStatusColor = (status: PostStatus) => {
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
  };

  return (
    <div className="min-h-screen bg-background">
      <FeedbackHeader
        selectedBoard={selectedBoard}
        onBoardChange={setSelectedBoard}
      />

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <FeedbackWelcome />
            <FeedbackList
              posts={filteredPosts}
              sortBy={sortBy}
              setSortBy={setSortBy}
              onCreatePost={() => setIsCreateModalOpen(true)}
              onPostClick={setSelectedPost}
            />
          </div>

          <div className="lg:col-span-1">
            <FeedbackSidebar
              selectedBoard={selectedBoard}
              onBoardChange={setSelectedBoard}
              totalPosts={posts.length}
              featurePosts={posts.filter((p) => p.type === "feature").length}
              bugPosts={posts.filter((p) => p.type === "bug").length}
            />
          </div>
        </div>
      </div>

      <CreatePostModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          isOpen={!!selectedPost}
          onClose={() => setSelectedPost(null)}
        />
      )}
    </div>
  );
}
