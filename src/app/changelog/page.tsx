import { ChangelogBoard } from "@/components/feedback/changelog-board";
export const runtime = "edge";
export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-background">
      <ChangelogBoard />
    </div>
  );
}
