import { RoadmapBoard } from "@/components/feedback/roadmap-board";
import { getFeedbackPosts } from "@/lib/notion";

export const runtime = "edge";

export default async function RoadmapPage() {
  // Fetch live feedback posts from Notion
  const feedbackPosts = await getFeedbackPosts();

  return (
    <div className="min-h-screen bg-background">
      <RoadmapBoard initialPosts={feedbackPosts} />
    </div>
  );
}
