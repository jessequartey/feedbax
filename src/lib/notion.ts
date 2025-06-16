import { Client } from "@notionhq/client";
import type { FeedbackPost, PostType, PostStatus } from "@/types/feedback";

// Initialize Notion client
export const notion = new Client({
  auth: process.env.NOTION_API_KEY,
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
 * Transform Notion page data to FeedbackPost format
 */
export function transformNotionPageToFeedbackPost(page: any): FeedbackPost {
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

  // Extract votes
  const upvotes = properties.Votes?.number || 0;

  // Extract submitter email or use default
  const submitterEmail =
    properties.Submitter?.email ||
    properties.Submitter?.rich_text?.[0]?.plain_text ||
    "";
  const author = submitterEmail || "Anonymous";

  // Extract dates
  const createdAt = properties["Created At"]?.created_time || page.created_time;
  const updatedAt =
    properties["Updated At"]?.date?.start || page.last_edited_time;

  // Generate avatar URL (using a placeholder service)
  const avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
    author
  )}`;

  return {
    id: page.id,
    title,
    description,
    type,
    status,
    upvotes,
    downvotes: 0,
    comments: 0, // We'll implement comments later
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
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) {
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
      database_id: process.env.NOTION_DATABASE_ID || "",
      sorts: [
        {
          property: "Votes",
          direction: "descending",
        },
      ],
    });

    return response.results.map(transformNotionPageToFeedbackPost);
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
        database_id: process.env.NOTION_DATABASE_ID || "",
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
          number: 0,
        },
        ...(data.submitter && {
          Submitter: {
            email: data.submitter,
          },
        }),
      },
    });

    return transformNotionPageToFeedbackPost(response);
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
