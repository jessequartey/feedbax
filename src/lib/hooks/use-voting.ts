"use client";

import { useState, useEffect, useCallback } from "react";
import { useAction } from "next-safe-action/hooks";
import { votePostAction } from "@/lib/actions";
import { hasVotedOnPost, addVotedPost, removeVotedPost } from "@/lib/voting";
import { toast } from "sonner";
import type { FeedbackPost } from "@/types/feedback";

/**
 * Custom hook for handling post voting functionality
 * Manages local storage validation and optimistic updates
 */
export function useVoting() {
  const [votedPosts, setVotedPosts] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  const [optimisticVotes, setOptimisticVotes] = useState<
    Record<string, number>
  >({});

  const { execute: executeVote, isExecuting } = useAction(votePostAction, {
    onSuccess: ({ data }) => {
      if (data?.data) {
        toast.success("Vote recorded! 👍");
        // Remove loading state
        setIsLoading((prev) => ({ ...prev, [data.data.postId]: false }));
        // Clear optimistic vote count since real data will come from revalidation
        setOptimisticVotes((prev) => {
          const newState = { ...prev };
          delete newState[data.data.postId];
          return newState;
        });
      }
    },
    onError: ({ error }) => {
      console.error("Vote error:", error);
      toast.error("Failed to record vote. Please try again.");

      // Find the failed post ID and revert optimistic updates
      const failedPostId = Object.keys(isLoading).find((id) => isLoading[id]);
      if (failedPostId) {
        // Revert optimistic vote
        setVotedPosts((prev) => {
          const newSet = new Set(prev);
          newSet.delete(failedPostId);
          return newSet;
        });
        // Remove optimistic vote count
        setOptimisticVotes((prev) => {
          const newState = { ...prev };
          delete newState[failedPostId];
          return newState;
        });
        // Remove from localStorage
        removeVotedPost(failedPostId);
      }

      // Remove loading state
      setIsLoading((prev) => {
        const newState = { ...prev };
        Object.keys(newState).forEach((key) => {
          newState[key] = false;
        });
        return newState;
      });
    },
  });

  // Initialize voted posts from localStorage on component mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Small delay to ensure hydration is complete
      const timeoutId = setTimeout(() => {
        const votedPostIds = new Set<string>();

        try {
          const votedPosts = localStorage.getItem("feedbax_voted_posts");
          if (votedPosts) {
            const parsed = JSON.parse(votedPosts);
            parsed.forEach((id: string) => votedPostIds.add(id));
          }
        } catch (error) {
          console.error("Error loading voted posts:", error);
        }

        setVotedPosts(votedPostIds);
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, []);

  /**
   * Check if user has voted on a specific post
   */
  const hasVoted = useCallback(
    (postId: string): boolean => {
      return votedPosts.has(postId);
    },
    [votedPosts]
  );

  /**
   * Handle voting on a post with validation and optimistic updates
   */
  const voteOnPost = useCallback(
    async (post: FeedbackPost) => {
      // Check if user has already voted
      if (hasVotedOnPost(post.id)) {
        toast.info("You've already voted on this post!");
        return false;
      }

      // Optimistically update the UI immediately
      setVotedPosts((prev) => new Set([...prev, post.id]));
      setOptimisticVotes((prev) => ({ ...prev, [post.id]: post.upvotes + 1 }));
      addVotedPost(post.id);

      // Set loading state
      setIsLoading((prev) => ({ ...prev, [post.id]: true }));

      try {
        // Execute the vote action
        await executeVote({
          postId: post.id,
          currentVotes: post.upvotes,
        });

        return true;
      } catch (error) {
        console.error("Error voting on post:", error);
        setIsLoading((prev) => ({ ...prev, [post.id]: false }));
        return false;
      }
    },
    [executeVote]
  );

  /**
   * Check if a specific post is currently being voted on
   */
  const isVotingOnPost = useCallback(
    (postId: string): boolean => {
      return isLoading[postId] || false;
    },
    [isLoading]
  );

  /**
   * Get the optimistic vote count for a post (includes pending vote)
   */
  const getOptimisticVoteCount = useCallback(
    (post: FeedbackPost): number => {
      return optimisticVotes[post.id] || post.upvotes;
    },
    [optimisticVotes]
  );

  return {
    hasVoted,
    voteOnPost,
    isVotingOnPost,
    getOptimisticVoteCount,
    isExecuting,
  };
}
