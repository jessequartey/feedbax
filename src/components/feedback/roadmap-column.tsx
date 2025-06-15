"use client"

import type { LucideIcon } from "lucide-react"
import { RoadmapCard } from "./roadmap-card"
import type { FeedbackPost } from "./feedback-board"

interface RoadmapColumnProps {
  title: string
  icon: LucideIcon
  posts: FeedbackPost[]
  className?: string
  onPostClick: (post: FeedbackPost) => void
}

export function RoadmapColumn({ title, icon: Icon, posts, className, onPostClick }: RoadmapColumnProps) {
  const getHeaderStyle = (title: string) => {
    switch (title) {
      case "Backlog":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
      case "Next up":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200"
      case "In Progress":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200"
      case "Done":
        return "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
    }
  }

  const getColumnStyle = (title: string) => {
    switch (title) {
      case "Backlog":
        return "bg-gray-50/50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-700"
      case "Next up":
        return "bg-purple-50/50 border-purple-200 dark:bg-purple-900/10 dark:border-purple-700"
      case "In Progress":
        return "bg-blue-50/50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-700"
      case "Done":
        return "bg-green-50/50 border-green-200 dark:bg-green-900/10 dark:border-green-700"
      default:
        return "bg-gray-50/50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-700"
    }
  }

  return (
    <div className="space-y-3">
      <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${getHeaderStyle(title)}`}>
        <div className="flex items-center space-x-2">
          <Icon className="h-4 w-4" aria-hidden="true" />
          <h2 className="font-medium text-sm">{title}</h2>
        </div>
        <span
          className="text-xs font-medium bg-white/20 dark:bg-black/20 px-2 py-1 rounded-full"
          aria-label={`${posts.length} items in ${title}`}
        >
          {posts.length}
        </span>
      </div>

      <div
        className={`min-h-96 p-3 rounded-lg border ${getColumnStyle(title)} space-y-3`}
        role="region"
        aria-label={`${title} column with ${posts.length} items`}
      >
        {posts.map((post) => (
          <RoadmapCard key={post.id} post={post} onClick={() => onPostClick(post)} />
        ))}
        {posts.length === 0 && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            No items in this column
          </div>
        )}
      </div>
    </div>
  )
}
