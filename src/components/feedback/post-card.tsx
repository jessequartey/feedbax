"use client"

import { ChevronUp, MessageSquare, Lightbulb, Bug } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { FeedbackPost } from "./feedback-board"

interface PostCardProps {
  post: FeedbackPost
  onClick: () => void
}

export function PostCard({ post, onClick }: PostCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "planned":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30"
      case "soon":
        return "bg-pink-500/20 text-pink-400 border-pink-500/30"
      case "completed":
        return "bg-green-500/20 text-green-400 border-green-500/30"
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30"
    }
  }

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + "k"
    }
    return num.toString()
  }

  return (
    <Card className="p-4 hover:bg-accent/50 cursor-pointer transition-colors border-border" onClick={onClick}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <Badge className={getStatusColor(post.status)} variant="outline">
              {post.status.toUpperCase()}
            </Badge>
          </div>

          <h3 className="font-semibold text-foreground mb-2 hover:text-primary transition-colors">{post.title}</h3>

          {post.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{post.description}</p>}

          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
            <div className="flex items-center space-x-1">
              {post.type === "feature" ? <Lightbulb className="h-4 w-4" /> : <Bug className="h-4 w-4" />}
              <span>{post.type === "feature" ? "Feature Request" : "Bug Report"}</span>
            </div>
            <span>{post.createdAt}</span>
            <div className="flex items-center space-x-1">
              <MessageSquare className="h-4 w-4" />
              <span>{post.comments}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center space-y-1 ml-4">
          <Button variant="ghost" size="sm" className="h-auto p-2 flex flex-col">
            <ChevronUp className="h-4 w-4" />
            <span className="text-xs font-medium">{formatNumber(post.upvotes)}</span>
          </Button>
        </div>
      </div>
    </Card>
  )
}
