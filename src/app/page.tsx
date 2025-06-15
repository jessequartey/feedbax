import { FeedbackBoard } from "@/components/feedback/feedback-board";
export const runtime = "edge";
export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <FeedbackBoard />
    </div>
  );
}
