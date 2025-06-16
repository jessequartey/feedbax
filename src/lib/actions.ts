"use server";

import { createSafeActionClient } from "next-safe-action";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createFeedbackPost, createPageComment } from "./notion";
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

      console.log("newPost", newPost);
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
