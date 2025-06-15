"use client"

import { useState } from "react"
import { FeedbackHeader } from "./feedback-header"
import { FeedbackSidebar } from "./feedback-sidebar"
import { FeedbackList } from "./feedback-list"
import { CreatePostModal } from "./create-post-modal"
import { PostDetailModal } from "./post-detail-modal"
import { FeedbackWelcome } from "./feedback-welcome"

export type PostType = "feature" | "bug"
export type PostStatus = "planned" | "soon" | "completed" | "under-review"

export interface FeedbackPost {
  id: string
  title: string
  description?: string
  type: PostType
  status: PostStatus
  upvotes: number
  comments: number
  author: string
  avatar: string
  createdAt: string
  tags?: string[]
}

const mockPosts: FeedbackPost[] = [
  {
    id: "1",
    title: "Mobile App for Learning on the Go",
    description:
      "Create a mobile app for Syllax so students can access AI-powered lessons, quizzes, and study materials while commuting or away from their computers.",
    type: "feature",
    status: "planned",
    upvotes: 2300,
    comments: 50,
    author: "John Doe",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "4 months ago",
  },
  {
    id: "2",
    title: '"Study Groups" (Collaborative Learning Spaces)',
    description:
      "Allow students to create shared study spaces where they can collaborate on assignments, share notes, and get AI assistance together.",
    type: "feature",
    status: "soon",
    upvotes: 1600,
    comments: 47,
    author: "Jane Smith",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "4 months ago",
  },
  {
    id: "3",
    title: "Offline Mode for Lessons",
    description:
      "Enable downloading of lessons and study materials for offline access when internet connectivity is poor.",
    type: "feature",
    status: "planned",
    upvotes: 860,
    comments: 33,
    author: "Mike Johnson",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "4 months ago",
  },
  {
    id: "4",
    title: "Share Learning Progress",
    description:
      "Allow students to share their learning progress and achievements with teachers, parents, or study partners.",
    type: "feature",
    status: "soon",
    upvotes: 772,
    comments: 19,
    author: "Sarah Wilson",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "4 months ago",
  },
  {
    id: "5",
    title: "Quiz results not saving properly",
    description:
      "When completing AI-generated quizzes, the results sometimes don't save correctly, causing students to lose their progress and scores.",
    type: "bug",
    status: "under-review",
    upvotes: 245,
    comments: 12,
    author: "Alex Chen",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "2 weeks ago",
  },
  {
    id: "6",
    title: "AI tutor responses getting cut off",
    description:
      "When asking the AI tutor complex questions, the responses sometimes get truncated mid-sentence, making it hard to understand the full explanation.",
    type: "bug",
    status: "planned",
    upvotes: 189,
    comments: 8,
    author: "Emma Davis",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "1 week ago",
  },
  {
    id: "7",
    title: "Study session timer resets unexpectedly",
    description:
      "The built-in study timer keeps resetting to zero during long study sessions, making it difficult to track actual study time.",
    type: "bug",
    status: "soon",
    upvotes: 156,
    comments: 15,
    author: "David Kim",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "3 days ago",
  },
]

export function FeedbackBoard() {
  const [posts] = useState<FeedbackPost[]>(mockPosts)
  const [selectedBoard, setSelectedBoard] = useState<"all" | "feature" | "bug">("all")
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedPost, setSelectedPost] = useState<FeedbackPost | null>(null)
  const [sortBy, setSortBy] = useState<"top" | "new" | "trending">("top")

  const filteredPosts = posts.filter((post) => {
    if (selectedBoard === "all") return true
    return post.type === selectedBoard
  })

  return (
    <div className="min-h-screen bg-background">
      <FeedbackHeader selectedBoard={selectedBoard} onBoardChange={setSelectedBoard} />

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <FeedbackWelcome />
            <FeedbackList
              posts={filteredPosts}
              sortBy={sortBy}
              setSortBy={setSortBy}
              onCreatePost={() => setIsCreateModalOpen(true)}
              onPostClick={setSelectedPost}
            />
          </div>

          <div className="lg:col-span-1">
            <FeedbackSidebar
              selectedBoard={selectedBoard}
              onBoardChange={setSelectedBoard}
              totalPosts={posts.length}
              featurePosts={posts.filter((p) => p.type === "feature").length}
              bugPosts={posts.filter((p) => p.type === "bug").length}
            />
          </div>
        </div>
      </div>

      <CreatePostModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />

      {selectedPost && (
        <PostDetailModal post={selectedPost} isOpen={!!selectedPost} onClose={() => setSelectedPost(null)} />
      )}
    </div>
  )
}
