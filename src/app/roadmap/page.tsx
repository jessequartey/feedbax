import { RoadmapBoard } from "@/components/feedback/roadmap-board";
import { getFeedbackPosts } from "@/lib/notion";
import { getUserFromCookies } from "@/lib/server-auth";

export const runtime = "edge";

export default async function RoadmapPage() {
  // Get current user from cookies
  const user = await getUserFromCookies();

  // Fetch live feedback posts from Notion with user context
  const feedbackPosts = await getFeedbackPosts(user?.email);

  return (
    <div className="min-h-screen bg-background">
      <RoadmapBoard initialPosts={feedbackPosts} />
    </div>
  );
}
