"use server";

import { createSafeActionClient } from "next-safe-action";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  createFeedbackPost,
  createPageComment,
  updateFeedbackPostVotes,
  updateFeedbackPostInterests,
  notion,
} from "./notion";
// Removed mockUser import - using actual user data from forms
import type { PostType } from "@/types/feedback";

// Create the action client
const actionClient = createSafeActionClient();

// Schema for creating a post
const createPostSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be less than 200 characters"),
  description: z
    .string()
    .max(2000, "Description must be less than 2000 characters")
    .optional()
    .default("No description provided"),
  type: z.enum(["feature", "bug", "improvement", "question"] as const),
  submitterEmail: z.string().email("Valid email is required"),
});

// Create post action
export const createPostAction = actionClient
  .schema(createPostSchema)
  .action(async ({ parsedInput: data }) => {
    try {
      const newPost = await createFeedbackPost({
        title: data.title,
        description: data.description,
        type: data.type as PostType,
        submitter: data.submitterEmail,
      });

      // Revalidate the feedback page to show the new post
      revalidatePath("/");
      revalidatePath("/roadmap");

      return {
        success: true,
        data: newPost,
      };
    } catch (error) {
      console.error("Error creating post:", error);
      throw new Error("Failed to create post. Please try again.");
    }
  });

// Schema for creating a comment
const createCommentSchema = z.object({
  postId: z.string().min(1, "Post ID is required"),
  content: z
    .string()
    .min(1, "Comment content is required")
    .max(2000, "Comment must be less than 2000 characters"),
  authorName: z.string().min(1, "Author name is required"),
  authorEmail: z.string().email("Valid email is required"),
  authorAvatar: z.string(),
});

// Create comment action
export const createCommentAction = actionClient
  .schema(createCommentSchema)
  .action(async ({ parsedInput: data }) => {
    try {
      const newComment = await createPageComment(data.postId, data.content, {
        name: data.authorName,
        email: data.authorEmail,
        avatar: data.authorAvatar,
      });

      // Auto-subscribe user to the post
      await autoSubscribeUserToPost(data.postId, data.authorEmail);

      // Revalidate the feedback page to show the new comment
      revalidatePath("/");
      revalidatePath("/roadmap");

      return {
        success: true,
        data: newComment,
      };
    } catch (error) {
      console.error("Error creating comment:", error);
      throw new Error("Failed to create comment. Please try again.");
    }
  });

// Schema for voting on a post
const votePostSchema = z.object({
  postId: z.string().min(1, "Post ID is required"),
  currentVotes: z.number().min(0, "Current votes must be a positive number"),
  userEmail: z.string().email("Valid email is required"),
});

// Vote post action
export const votePostAction = actionClient
  .schema(votePostSchema)
  .action(async ({ parsedInput: data }) => {
    try {
      // Update the vote count in Notion (increment by 1)
      const newVoteCount = data.currentVotes + 1;
      await updateFeedbackPostVotes(data.postId, newVoteCount);

      // Auto-subscribe user to the post
      await autoSubscribeUserToPost(data.postId, data.userEmail);

      // Revalidate the pages to show the updated vote count
      revalidatePath("/");
      revalidatePath("/roadmap");

      return {
        success: true,
        data: {
          postId: data.postId,
          newVoteCount,
        },
      };
    } catch (error) {
      console.error("Error voting on post:", error);
      throw new Error("Failed to vote on post. Please try again.");
    }
  });

// Schema for subscribing to post interests
const subscribeToPostSchema = z.object({
  postId: z.string().min(1, "Post ID is required"),
  userEmail: z.string().email("Valid email is required"),
  isSubscribing: z.boolean(),
});

// Subscribe to post action
export const subscribeToPostAction = actionClient
  .schema(subscribeToPostSchema)
  .action(async ({ parsedInput: data }) => {
    try {
      // First, fetch the current post to get existing interests
      const page = await notion.pages.retrieve({
        page_id: data.postId,
      });

      // Extract current interests from the page
      const properties = 'properties' in page ? page.properties as Record<string, unknown> : {};
      const interestsProperty = properties.Interests as { rich_text?: Array<{ plain_text?: string }> } | undefined;
      const currentInterestsText = interestsProperty?.rich_text?.[0]?.plain_text || "";

      // Parse current interests
      const currentInterests = currentInterestsText
        .split(",")
        .map((email: string) => email.trim())
        .filter((email: string) => email.length > 0);

      let updatedInterests: string[];

      if (data.isSubscribing) {
        // Add user email if not already present
        if (!currentInterests.includes(data.userEmail)) {
          updatedInterests = [...currentInterests, data.userEmail];
        } else {
          updatedInterests = currentInterests;
        }
      } else {
        // Remove user email from interests
        updatedInterests = currentInterests.filter(
          (email: string) => email !== data.userEmail
        );
      }

      // Update interests in Notion
      await updateFeedbackPostInterests(data.postId, updatedInterests);

      // Revalidate the pages to show the updated subscription status
      revalidatePath("/");
      revalidatePath("/roadmap");

      return {
        success: true,
        data: {
          postId: data.postId,
          isSubscribed: updatedInterests.includes(data.userEmail),
        },
      };
    } catch (error) {
      console.error("Error updating post subscription:", error);
      throw new Error("Failed to update subscription. Please try again.");
    }
  });

// Schema for rating post importance
const rateImportanceSchema = z.object({
  postId: z.string().min(1, "Post ID is required"),
  userEmail: z.string().email("Valid email is required"),
  importance: z.enum([
    "not-important",
    "nice-to-have",
    "important",
    "essential",
  ]),
});

// Rate importance action
export const rateImportanceAction = actionClient
  .schema(rateImportanceSchema)
  .action(async ({ parsedInput: data }) => {
    try {
      // Auto-subscribe user to the post when they rate importance
      await autoSubscribeUserToPost(data.postId, data.userEmail);

      // Note: We're not storing the importance rating in Notion for now
      // This could be extended to store ratings in a separate property

      return {
        success: true,
        data: {
          postId: data.postId,
          importance: data.importance,
        },
      };
    } catch (error) {
      console.error("Error rating post importance:", error);
      throw new Error("Failed to rate post importance. Please try again.");
    }
  });

/**
 * Helper function to automatically add user to interests when they interact with a post
 */
async function autoSubscribeUserToPost(
  postId: string,
  userEmail: string
): Promise<void> {
  try {
    // Fetch the current post to get existing interests
    const page = await notion.pages.retrieve({
      page_id: postId,
    });

    // Extract current interests from the page
    const properties = 'properties' in page ? page.properties as Record<string, unknown> : {};
    const interestsProperty = properties.Interests as { rich_text?: Array<{ plain_text?: string }> } | undefined;
    const currentInterestsText = interestsProperty?.rich_text?.[0]?.plain_text || "";

    // Parse current interests
    const currentInterests = currentInterestsText
      .split(",")
      .map((email: string) => email.trim())
      .filter((email: string) => email.length > 0);

    // Add user email if not already present
    if (!currentInterests.includes(userEmail)) {
      const updatedInterests = [...currentInterests, userEmail];
      await updateFeedbackPostInterests(postId, updatedInterests);
    }
  } catch (error) {
    console.error("Error auto-subscribing user to post:", error);
    // Don't throw error as this is a background operation
  }
}
