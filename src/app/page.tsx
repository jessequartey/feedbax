import { FeedbackBoard } from "@/components/feedback/feedback-board";
import { getFeedbackPosts } from "@/lib/notion";

export const runtime = "edge";

export default async function Home() {
  // Fetch live feedback posts from Notion
  const feedbackPosts = await getFeedbackPosts();

  return (
    <div className="min-h-screen bg-background">
      <FeedbackBoard initialPosts={feedbackPosts} />
    </div>
  );
}
