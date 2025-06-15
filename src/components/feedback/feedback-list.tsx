"use client"

import { Search, TrendingUp, Clock, Flame } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { FeedbackPost } from "./feedback-board"
import { PostCard } from "./post-card"

interface FeedbackListProps {
  posts: FeedbackPost[]
  sortBy: "top" | "new" | "trending"
  setSortBy: (sort: "top" | "new" | "trending") => void
  onCreatePost: () => void
  onPostClick: (post: FeedbackPost) => void
}

export function FeedbackList({ posts, sortBy, setSortBy, onCreatePost, onPostClick }: FeedbackListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Button variant={sortBy === "top" ? "secondary" : "ghost"} size="sm" onClick={() => setSortBy("top")}>
            <TrendingUp className="h-4 w-4 mr-2" />
            Top
          </Button>
          <Button variant={sortBy === "new" ? "secondary" : "ghost"} size="sm" onClick={() => setSortBy("new")}>
            <Clock className="h-4 w-4 mr-2" />
            New
          </Button>
          <Button
            variant={sortBy === "trending" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSortBy("trending")}
          >
            <Flame className="h-4 w-4 mr-2" />
            Trending
          </Button>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search" className="pl-10 w-64" />
          </div>
          <Button onClick={onCreatePost} className="bg-pink-600 hover:bg-pink-700">
            Submit new feature/bug
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} onClick={() => onPostClick(post)} />
        ))}
      </div>
    </div>
  )
}
