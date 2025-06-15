"use client"

import { useState } from "react"
import { Search, Filter, Zap, CheckCircle, Clock, Archive } from "lucide-react"
import { FeedbackHeader } from "./feedback-header"
import { PostDetailModal } from "./post-detail-modal"
import { RoadmapColumn } from "./roadmap-column"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { FeedbackPost } from "./feedback-board"

const mockRoadmapPosts: FeedbackPost[] = [
  // Backlog
  {
    id: "r1",
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
    id: "r2",
    title: "Desktop app",
    description: "Create a native desktop application for better performance and native OS integration.",
    type: "feature",
    status: "planned",
    upvotes: 861,
    comments: 33,
    author: "Mike Johnson",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "4 months ago",
  },
  {
    id: "r3",
    title: "Expose temperature level in settings",
    description: "Allow users to adjust AI response creativity and randomness through temperature settings.",
    type: "feature",
    status: "planned",
    upvotes: 403,
    comments: 5,
    author: "Alex Chen",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "3 months ago",
  },
  {
    id: "r4",
    title: "Up arrow to fill the input with the previous question",
    description: "Add keyboard shortcut to quickly reuse previous questions for iterative learning.",
    type: "feature",
    status: "planned",
    upvotes: 254,
    comments: 7,
    author: "Sarah Wilson",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "2 months ago",
  },
  {
    id: "r5",
    title: "Sign-in with Apple",
    description: "Add Apple ID authentication option for easier access on Apple devices.",
    type: "feature",
    status: "planned",
    upvotes: 236,
    comments: 4,
    author: "Emma Davis",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "1 month ago",
  },
  {
    id: "r6",
    title: "Custom Learning Paths",
    description: "Allow educators to create custom learning paths and curricula for their students.",
    type: "feature",
    status: "planned",
    upvotes: 189,
    comments: 12,
    author: "David Kim",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "3 weeks ago",
  },

  // Next up
  {
    id: "r7",
    title: '"Study Groups" (Grouping threads with shared context)',
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
    id: "r8",
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
    id: "r9",
    title: "Allow more file types",
    description: "Support additional file formats for assignments and study materials (PDF, DOCX, PPTX, etc.).",
    type: "feature",
    status: "soon",
    upvotes: 551,
    comments: 14,
    author: "Mike Johnson",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "2 months ago",
  },
  {
    id: "r10",
    title: "AI Tutor Filter in Search Setting",
    description: "Add filtering options to search through AI tutor responses and recommendations.",
    type: "feature",
    status: "soon",
    upvotes: 101,
    comments: 4,
    author: "Alex Chen",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "1 month ago",
  },

  // In Progress
  {
    id: "r11",
    title: "Web search on additional learning models",
    description:
      "Integrate web search capabilities with specialized educational AI models for enhanced learning support.",
    type: "feature",
    status: "under-review",
    upvotes: 565,
    comments: 16,
    author: "Emma Davis",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "3 months ago",
  },
  {
    id: "r12",
    title: "Add Download button for study materials",
    description: "Allow students to download formatted study guides, notes, and lesson summaries.",
    type: "feature",
    status: "under-review",
    upvotes: 174,
    comments: 8,
    author: "David Kim",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "2 months ago",
  },
  {
    id: "r13",
    title: "Text file limit should be increased for assignments",
    description:
      "Increase the file size limit for text-based assignments and essays to accommodate longer submissions.",
    type: "feature",
    status: "under-review",
    upvotes: 96,
    comments: 7,
    author: "Jane Smith",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "1 month ago",
  },
  {
    id: "r14",
    title: "Edit/replace attachment",
    description: "Allow students to edit or replace file attachments after submission.",
    type: "feature",
    status: "under-review",
    upvotes: 54,
    comments: 4,
    author: "John Doe",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "3 weeks ago",
  },
  {
    id: "r15",
    title: "Ability to open study session from 'more models' view",
    description: "Quick access to start focused study sessions directly from the model selection interface.",
    type: "feature",
    status: "under-review",
    upvotes: 53,
    comments: 2,
    author: "Sarah Wilson",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "2 weeks ago",
  },

  // Done
  {
    id: "r16",
    title: "SYLLAX SYSTEM MAINTENANCE",
    description: "Scheduled maintenance and system updates completed successfully.",
    type: "feature",
    status: "completed",
    upvotes: 1400,
    comments: 5,
    author: "System Admin",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "1 week ago",
  },
  {
    id: "r17",
    title: "Add Image Generation for Study Aids",
    description: "Generate visual study aids, diagrams, and illustrations to enhance learning materials.",
    type: "feature",
    status: "completed",
    upvotes: 699,
    comments: 24,
    author: "Emma Davis",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "2 weeks ago",
  },
  {
    id: "r18",
    title: "Text file attachments",
    description: "Support for attaching text files to assignments and study materials.",
    type: "feature",
    status: "completed",
    upvotes: 650,
    comments: 21,
    author: "Mike Johnson",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "3 weeks ago",
  },
  {
    id: "r19",
    title: "PDF attachments",
    description: "Full support for PDF file attachments in assignments and study resources.",
    type: "feature",
    status: "completed",
    upvotes: 630,
    comments: 24,
    author: "Alex Chen",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "1 month ago",
  },
  {
    id: "r20",
    title: "Use our own API Keys",
    description: "Implement custom API key management for enhanced security and performance.",
    type: "feature",
    status: "completed",
    upvotes: 441,
    comments: 34,
    author: "David Kim",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "1 month ago",
  },
  {
    id: "r21",
    title: '"Branching" study sessions',
    description: "Create branching study paths that adapt based on student performance and interests.",
    type: "feature",
    status: "completed",
    upvotes: 409,
    comments: 22,
    author: "Jane Smith",
    avatar: "/placeholder.svg?height=32&width=32",
    createdAt: "6 weeks ago",
  },
]

export function RoadmapBoard() {
  const [selectedPost, setSelectedPost] = useState<FeedbackPost | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const getPostsByStatus = (status: string) => {
    return mockRoadmapPosts.filter((post) => {
      const matchesStatus =
        (status === "backlog" && post.status === "planned") ||
        (status === "next-up" && post.status === "soon") ||
        (status === "in-progress" && post.status === "under-review") ||
        (status === "done" && post.status === "completed")

      const matchesSearch =
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.description?.toLowerCase().includes(searchQuery.toLowerCase())

      return matchesStatus && matchesSearch
    })
  }

  const columns = [
    {
      id: "backlog",
      title: "Backlog",
      icon: Archive,
      posts: getPostsByStatus("backlog"),
    },
    {
      id: "next-up",
      title: "Next up",
      icon: Clock,
      posts: getPostsByStatus("next-up"),
    },
    {
      id: "in-progress",
      title: "In Progress",
      icon: Zap,
      posts: getPostsByStatus("in-progress"),
    },
    {
      id: "done",
      title: "Done",
      icon: CheckCircle,
      posts: getPostsByStatus("done"),
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      <FeedbackHeader />

      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1">Main Roadmap</h1>
            <p className="text-sm text-muted-foreground">Track the progress of Syllax features and improvements</p>
          </div>
          <div className="flex items-center space-x-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search roadmap..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-64"
                aria-label="Search roadmap items"
              />
            </div>
            <Button variant="outline" size="sm" aria-label="Filter roadmap items">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {columns.map((column) => (
            <RoadmapColumn
              key={column.id}
              title={column.title}
              icon={column.icon}
              posts={column.posts}
              onPostClick={setSelectedPost}
            />
          ))}
        </div>

        <div className="mt-8 text-right">
          <div className="text-xs text-muted-foreground">⚡ Powered by Feedbax</div>
        </div>
      </div>

      {selectedPost && (
        <PostDetailModal post={selectedPost} isOpen={!!selectedPost} onClose={() => setSelectedPost(null)} />
      )}
    </div>
  )
}
