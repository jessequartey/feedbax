"use client";

import type { LucideIcon } from "lucide-react";
import { RoadmapCard } from "./roadmap-card";
import type { FeedbackPost } from "@/types/feedback";

interface RoadmapColumnProps {
  title: string;
  icon: LucideIcon;
  posts: FeedbackPost[];
  className?: string;
  onPostClick: (post: FeedbackPost) => void;
  onUpvote?: (postId: string) => void;
  hasVoted?: (postId: string) => boolean;
  isVotingOnPost?: (postId: string) => boolean;
  getOptimisticVoteCount?: (post: FeedbackPost) => number;
}

export function RoadmapColumn({
  title,
  icon: Icon,
  posts,
  className,
  onPostClick,
  onUpvote,
  hasVoted,
  isVotingOnPost,
  getOptimisticVoteCount,
}: RoadmapColumnProps) {
  const getHeaderStyle = (title: string) => {
    switch (title) {
      case "Backlog":
        return "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700";
      case "Next up":
        return "bg-violet-100 text-violet-700 border border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700/50";
      case "In Progress":
        return "bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700/50";
      case "Done":
        return "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700/50";
      default:
        return "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700";
    }
  };

  const getColumnStyle = (title: string) => {
    switch (title) {
      case "Backlog":
        return "bg-slate-50/80 border-slate-200/60 dark:bg-slate-900/30 dark:border-slate-700/50";
      case "Next up":
        return "bg-violet-50/80 border-violet-200/60 dark:bg-violet-950/30 dark:border-violet-800/50";
      case "In Progress":
        return "bg-blue-50/80 border-blue-200/60 dark:bg-blue-950/30 dark:border-blue-800/50";
      case "Done":
        return "bg-emerald-50/80 border-emerald-200/60 dark:bg-emerald-950/30 dark:border-emerald-800/50";
      default:
        return "bg-slate-50/80 border-slate-200/60 dark:bg-slate-900/30 dark:border-slate-700/50";
    }
  };

  const getCountStyle = (title: string) => {
    switch (title) {
      case "Backlog":
        return "bg-slate-200/60 text-slate-700 dark:bg-slate-700/60 dark:text-slate-300";
      case "Next up":
        return "bg-violet-200/60 text-violet-700 dark:bg-violet-800/60 dark:text-violet-300";
      case "In Progress":
        return "bg-blue-200/60 text-blue-700 dark:bg-blue-800/60 dark:text-blue-300";
      case "Done":
        return "bg-emerald-200/60 text-emerald-700 dark:bg-emerald-800/60 dark:text-emerald-300";
      default:
        return "bg-slate-200/60 text-slate-700 dark:bg-slate-700/60 dark:text-slate-300";
    }
  };

  return (
    <div className="space-y-4">
      <div
        className={`flex items-center justify-between px-4 py-3 rounded-xl shadow-sm ${getHeaderStyle(
          title
        )}`}
      >
        <div className="flex items-center space-x-2">
          <Icon className="h-4 w-4" aria-hidden="true" />
          <h2 className="font-semibold text-sm">{title}</h2>
        </div>
        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getCountStyle(
            title
          )}`}
          aria-label={`${posts.length} items in ${title}`}
        >
          {posts.length}
        </span>
      </div>

      <div
        className={`min-h-96 p-4 rounded-xl border-2 border-dashed ${getColumnStyle(
          title
        )} space-y-3 transition-colors`}
        role="region"
        aria-label={`${title} column with ${posts.length} items`}
      >
        {posts.map((post) => (
          <RoadmapCard
            key={post.id}
            post={
              getOptimisticVoteCount
                ? { ...post, upvotes: getOptimisticVoteCount(post) }
                : post
            }
            onClick={() => onPostClick(post)}
            onUpvote={onUpvote}
            isUpvoted={hasVoted?.(post.id)}
            upvoteDisabled={isVotingOnPost?.(post.id)}
          />
        ))}
        {posts.length === 0 && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm font-medium">
            No items yet
          </div>
        )}
      </div>
    </div>
  );
}
