import { Client } from "@notionhq/client";
import type {
  FeedbackPost,
  PostType,
  PostStatus,
  FeedbackComment,
} from "@/types/feedback";
import { env } from "@/env";

// Initialize Notion client
export const notion = new Client({
  auth: env.NOTION_API_KEY,
});

// Type mapping from Notion to our types
const typeMapping: Record<string, PostType> = {
  "Bug report": "bug",
  "Feature request": "feature",
  Improvement: "improvement",
  Question: "question",
};

const statusMapping: Record<string, PostStatus> = {
  Backlog: "backlog",
  "Next Up": "next-up",
  "In Progress": "in-progress",
  "Under Review": "under-review",
  Done: "done",
  Cancelled: "cancelled",
};

/**
 * Get comments count for a Notion page
 */
export async function getCommentsCount(pageId: string): Promise<number> {
  try {
    const response = await notion.comments.list({
      block_id: pageId,
    });
    return response.results.length;
  } catch (error) {
    console.error("Error fetching comments count:", error);
    return 0;
  }
}

/**
 * Get comments for a Notion page
 */
export async function getPageComments(
  pageId: string
): Promise<FeedbackComment[]> {
  try {
    const response = await notion.comments.list({
      block_id: pageId,
    });

    return response.results.map((comment: any) => {
      const fullContent = comment.rich_text?.[0]?.plain_text || "";

      // Parse embedded user metadata
      const metadataMatch = fullContent.match(
        /\n\n---\nAuthor: (.+?) \((.+?)\)$/
      );
      let content = fullContent;
      let authorName = "Anonymous";
      let authorEmail = "";
      let isAdmin = false;

      if (metadataMatch) {
        // Extract content without metadata
        content = fullContent.replace(/\n\n---\nAuthor: .+$/, "");
        authorName = metadataMatch[1];
        authorEmail = metadataMatch[2];
      } else {
        // This is likely an admin comment from Notion (no embedded metadata)
        authorName = "Admin";
        isAdmin = true;
      }

      // Generate avatar - use admin icon for admin comments
      let avatar;
      if (isAdmin) {
        // Use a shield icon or admin-specific avatar
        avatar = `https://api.dicebear.com/7.x/shapes/svg?seed=admin&backgroundColor=3b82f6&shape1Color=ffffff`;
      } else {
        avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
          authorName
        )}`;
      }

      return {
        id: comment.id,
        postId: pageId,
        content: content,
        author: authorName,
        authorId: authorEmail || comment.created_by?.id,
        avatar: avatar,
        createdAt: formatDate(comment.created_time),
        updatedAt: comment.last_edited_time
          ? formatDate(comment.last_edited_time)
          : undefined,
        notionBlockId: comment.id,
        isAuthorResponse: isAdmin,
      };
    });
  } catch (error) {
    console.error("Error fetching comments:", error);
    return [];
  }
}

/**
 * Transform Notion page data to FeedbackPost format
 */
export async function transformNotionPageToFeedbackPost(
  page: any
): Promise<FeedbackPost> {
  const properties = page.properties;

  // Extract title
  const title = properties.Title?.title?.[0]?.plain_text || "Untitled";

  // Extract description
  const description = properties.Description?.rich_text?.[0]?.plain_text || "";

  // Extract and map type
  const notionType = properties.Type?.select?.name || "Feature request";
  const type = typeMapping[notionType] || "feature";

  // Extract and map status
  const notionStatus = properties.Status?.status?.name || "Backlog";
  const status = statusMapping[notionStatus] || "backlog";

  // Extract votes - handle both number and null cases
  const upvotes =
    typeof properties.Votes?.number === "number" ? properties.Votes.number : 0;

  // Extract submitter email or use default
  const submitterEmail =
    properties.Submitter?.email ||
    properties.Submitter?.rich_text?.[0]?.plain_text ||
    "";
  const author = submitterEmail || "Anonymous";

  // Extract dates with better fallback handling
  const createdAt =
    properties["Created At"]?.created_time ||
    properties.splv?.created_time || // fallback to property ID
    page.created_time;

  const updatedAt =
    properties["Updated At"]?.date?.start ||
    properties.ZIRF?.date?.start || // fallback to property ID
    page.last_edited_time;

  // Generate avatar URL (using a placeholder service)
  const avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
    author
  )}`;

  // Get comments count from Notion page
  const commentsCount = await getCommentsCount(page.id);

  return {
    id: page.id,
    title,
    description,
    type,
    status,
    upvotes,
    downvotes: 0,
    comments: commentsCount,
    author,
    avatar,
    createdAt: formatDate(createdAt),
    updatedAt: formatDate(updatedAt),
    notionPageId: page.id,
    notionUrl: page.url,
  };
}

/**
 * Format date to relative time string
 */
function formatDate(dateString: string): string {
  if (!dateString) return "Unknown";

  const date = new Date(dateString);

  // Check if date is valid
  if (isNaN(date.getTime())) {
    console.warn("Invalid date string:", dateString);
    return "Unknown";
  }

  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));

  if (diffInHours < 1) {
    return "Just now";
  } else if (diffInHours < 24) {
    return diffInHours === 1 ? "1 hour ago" : `${diffInHours} hours ago`;
  } else if (diffInDays === 0) {
    return "Today";
  } else if (diffInDays === 1) {
    return "1 day ago";
  } else if (diffInDays < 7) {
    return `${diffInDays} days ago`;
  } else if (diffInDays < 30) {
    const weeks = Math.floor(diffInDays / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  } else {
    const months = Math.floor(diffInDays / 30);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }
}

/**
 * Fetch all feedback posts from Notion database
 */
export async function getFeedbackPosts(): Promise<FeedbackPost[]> {
  try {
    const response = await notion.databases.query({
      database_id: env.NOTION_DATABASE_ID,
      sorts: [
        {
          property: "Votes",
          direction: "descending",
        },
      ],
    });

    // Transform pages with comments count (parallel processing for better performance)
    const posts = await Promise.all(
      response.results.map(transformNotionPageToFeedbackPost)
    );

    return posts;
  } catch (error) {
    console.error("Error fetching feedback posts from Notion:", error);
    throw new Error("Failed to fetch feedback posts");
  }
}

/**
 * Create a new feedback post in Notion
 */
export async function createFeedbackPost(data: {
  title: string;
  description: string;
  type: PostType;
  submitter?: string;
}): Promise<FeedbackPost> {
  try {
    // Map our types back to Notion format
    const notionType =
      Object.entries(typeMapping).find(
        ([_, value]) => value === data.type
      )?.[0] || "Feature request";

    const response = await notion.pages.create({
      parent: {
        database_id: env.NOTION_DATABASE_ID || "",
      },
      properties: {
        Title: {
          title: [
            {
              text: {
                content: data.title,
              },
            },
          ],
        },
        Description: {
          rich_text: [
            {
              text: {
                content: data.description,
              },
            },
          ],
        },
        Type: {
          select: {
            name: notionType,
          },
        },
        Status: {
          status: {
            name: "Backlog",
          },
        },
        Votes: {
          number: 1,
        },
        ...(data.submitter && {
          Submitter: {
            email: data.submitter,
          },
        }),
      },
    });

    return await transformNotionPageToFeedbackPost(response);
  } catch (error) {
    console.error("Error creating feedback post in Notion:", error);
    throw new Error("Failed to create feedback post");
  }
}

/**
 * Update vote count for a feedback post
 */
export async function updateFeedbackPostVotes(
  pageId: string,
  votes: number
): Promise<void> {
  try {
    await notion.pages.update({
      page_id: pageId,
      properties: {
        Votes: {
          number: votes,
        },
      },
    });
  } catch (error) {
    console.error("Error updating feedback post votes:", error);
    throw new Error("Failed to update votes");
  }
}

/**
 * Create a comment on a Notion page
 */
export async function createPageComment(
  pageId: string,
  content: string,
  author: {
    name: string;
    email: string;
    avatar: string;
  }
): Promise<FeedbackComment> {
  try {
    // Create the comment content with user metadata embedded
    const commentContent = `${content}\n\n---\nAuthor: ${author.name} (${author.email})`;

    const response = await notion.comments.create({
      parent: {
        page_id: pageId,
      },
      rich_text: [
        {
          text: {
            content: commentContent,
          },
        },
      ],
    });

    // Type assertion for the response since Notion API types might not be fully typed
    const comment = response as any;

    return {
      id: comment.id,
      postId: pageId,
      content: content, // Return original content without metadata
      author: author.name,
      authorId: author.email,
      avatar: author.avatar,
      createdAt: formatDate(comment.created_time || new Date().toISOString()),
      notionBlockId: comment.id,
    };
  } catch (error) {
    console.error("Error creating comment in Notion:", error);
    throw new Error("Failed to create comment");
  }
}
