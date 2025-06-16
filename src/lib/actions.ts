"use server";

import { createSafeActionClient } from "next-safe-action";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createFeedbackPost } from "./notion";
import { mockUser } from "@/types/user";
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
        submitter: mockUser.email, // Use the mock user's email as submitter
      });

      console.log("newPost", newPost);
      // Revalidate the feedback page to show the new post
      revalidatePath("/");

      return {
        success: true,
        data: newPost,
      };
    } catch (error) {
      console.error("Error creating post:", error);
      throw new Error("Failed to create post. Please try again.");
    }
  });
