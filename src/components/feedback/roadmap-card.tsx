"use client"

import { ChevronUp, MessageSquare, Lightbulb, Bug } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { FeedbackPost } from "./feedback-board"

interface RoadmapCardProps {
  post: FeedbackPost
  onClick: () => void
}

export function RoadmapCard({ post, onClick }: RoadmapCardProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + "k"
    }
    return num.toString()
  }

  return (
    <Card
      className="p-3 hover:bg-accent/50 cursor-pointer transition-all duration-200 border-border bg-card hover:shadow-sm focus-within:ring-2 focus-within:ring-primary/20"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${post.title}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <div className="space-y-3">
        <h3 className="font-medium text-sm leading-snug hover:text-primary transition-colors line-clamp-2">
          {post.title}
        </h3>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center space-x-1">
            {post.type === "feature" ? (
              <Lightbulb className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Bug className="h-3 w-3" aria-hidden="true" />
            )}
            <span>{post.type === "feature" ? "Feature Request" : "Bug Report"}</span>
          </div>
          <div className="flex items-center space-x-1" aria-label={`${post.comments} comments`}>
            <MessageSquare className="h-3 w-3" aria-hidden="true" />
            <span>{post.comments}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{post.createdAt}</div>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-1 flex items-center space-x-1 hover:bg-primary/10"
            aria-label={`${formatNumber(post.upvotes)} upvotes`}
            tabIndex={-1}
          >
            <ChevronUp className="h-3 w-3" aria-hidden="true" />
            <span className="text-xs font-medium">{formatNumber(post.upvotes)}</span>
          </Button>
        </div>
      </div>
    </Card>
  )
}
