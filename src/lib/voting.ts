"use client";

/**
 * Voting utilities for local storage management
 * Handles tracking which posts a user has voted on
 */

const VOTED_POSTS_KEY = "feedbax_voted_posts";

/**
 * Get list of voted post IDs from local storage
 */
export function getVotedPosts(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const votedPosts = localStorage.getItem(VOTED_POSTS_KEY);
    return votedPosts ? JSON.parse(votedPosts) : [];
  } catch (error) {
    console.error("Error reading voted posts from localStorage:", error);
    return [];
  }
}

/**
 * Check if user has voted on a specific post
 */
export function hasVotedOnPost(postId: string): boolean {
  const votedPosts = getVotedPosts();
  return votedPosts.includes(postId);
}

/**
 * Add a post ID to the voted posts list
 */
export function addVotedPost(postId: string): void {
  if (typeof window === "undefined") return;

  try {
    const votedPosts = getVotedPosts();
    if (!votedPosts.includes(postId)) {
      votedPosts.push(postId);
      localStorage.setItem(VOTED_POSTS_KEY, JSON.stringify(votedPosts));
    }
  } catch (error) {
    console.error("Error saving voted post to localStorage:", error);
  }
}

/**
 * Remove a post ID from the voted posts list (for potential undo functionality)
 */
export function removeVotedPost(postId: string): void {
  if (typeof window === "undefined") return;

  try {
    const votedPosts = getVotedPosts();
    const updatedPosts = votedPosts.filter((id) => id !== postId);
    localStorage.setItem(VOTED_POSTS_KEY, JSON.stringify(updatedPosts));
  } catch (error) {
    console.error("Error removing voted post from localStorage:", error);
  }
}

/**
 * Clear all voted posts (for testing or reset functionality)
 */
export function clearVotedPosts(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(VOTED_POSTS_KEY);
  } catch (error) {
    console.error("Error clearing voted posts from localStorage:", error);
  }
}
