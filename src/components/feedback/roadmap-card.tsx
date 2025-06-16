"use client";

import { ChevronUp, MessageSquare, Lightbulb, Bug } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { FeedbackPost } from "@/types/feedback";

interface RoadmapCardProps {
  post: FeedbackPost;
  onClick: () => void;
}

export function RoadmapCard({ post, onClick }: RoadmapCardProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + "k";
    }
    return num.toString();
  };

  const getTypeStyle = (type: string) => {
    switch (type) {
      case "feature":
        return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/50";
      case "bug":
        return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700/50";
      case "improvement":
        return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/50";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/30 dark:text-slate-300 dark:border-slate-700/50";
    }
  };

  const getTypeText = (type: string) => {
    switch (type) {
      case "feature":
        return "Feature";
      case "bug":
        return "Bug";
      case "improvement":
        return "Enhancement";
      default:
        return type;
    }
  };

  return (
    <Card
      className="p-4 hover:bg-accent/30 cursor-pointer transition-all duration-200 border-border/60 bg-card/80 backdrop-blur-sm hover:shadow-md hover:border-border hover:scale-[1.02] focus-within:ring-2 focus-within:ring-primary/30"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${post.title}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-snug hover:text-primary transition-colors line-clamp-2 flex-1">
            {post.title}
          </h3>
          <Badge
            variant="outline"
            className={`text-xs px-2 py-0.5 border ${getTypeStyle(
              post.type
            )} flex-shrink-0`}
          >
            <div className="flex items-center space-x-1">
              {post.type === "feature" ? (
                <Lightbulb className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Bug className="h-3 w-3" aria-hidden="true" />
              )}
              <span>{getTypeText(post.type)}</span>
            </div>
          </Badge>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center space-x-3">
            <div
              className="flex items-center space-x-1"
              aria-label={`${post.comments} comments`}
            >
              <MessageSquare className="h-3 w-3" aria-hidden="true" />
              <span>{post.comments}</span>
            </div>
            <div className="text-xs">{post.createdAt}</div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-1.5 flex items-center space-x-1 hover:bg-primary/10 rounded-md transition-colors"
            aria-label={`${formatNumber(post.upvotes)} upvotes`}
            tabIndex={-1}
          >
            <ChevronUp className="h-3 w-3 text-primary" aria-hidden="true" />
            <span className="text-xs font-semibold text-primary">
              {formatNumber(post.upvotes)}
            </span>
          </Button>
        </div>
      </div>
    </Card>
  );
}
