"use client";

import { Eye, Lightbulb, Bug } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface FeedbackSidebarProps {
  selectedBoard?: "all" | "feature" | "bug";
  onBoardChange?: (board: "all" | "feature" | "bug") => void;
  totalPosts: number;
  featurePosts: number;
  bugPosts: number;
}

export function FeedbackSidebar({
  selectedBoard = "all",
  onBoardChange = () => {},
  totalPosts,
  featurePosts,
  bugPosts,
}: FeedbackSidebarProps) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="font-semibold mb-3">Boards</h3>
        <div className="space-y-2">
          <Button
            variant={selectedBoard === "all" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => onBoardChange("all")}
          >
            <Eye className="h-4 w-4 mr-2" />
            View all posts
            <span className="ml-auto text-xs text-muted-foreground">
              {totalPosts}
            </span>
          </Button>

          <Button
            variant={selectedBoard === "feature" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => onBoardChange("feature")}
          >
            <Lightbulb className="h-4 w-4 mr-2" />
            Feature Request
            <span className="ml-auto text-xs text-muted-foreground">
              {featurePosts}
            </span>
          </Button>

          <Button
            variant={selectedBoard === "bug" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => onBoardChange("bug")}
          >
            <Bug className="h-4 w-4 mr-2" />
            Bug Reports
            <span className="ml-auto text-xs text-muted-foreground">
              {bugPosts}
            </span>
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-xs text-muted-foreground text-center">
          ⚡ Powered by Feedbax
        </div>
      </Card>
    </div>
  );
}
