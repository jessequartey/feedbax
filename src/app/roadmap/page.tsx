import { RoadmapBoard } from "@/components/feedback/roadmap-board";
export const runtime = "edge";
export default function RoadmapPage() {
  return (
    <div className="min-h-screen bg-background">
      <RoadmapBoard />
    </div>
  );
}
