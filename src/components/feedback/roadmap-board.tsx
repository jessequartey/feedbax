"use client";

import { useState } from "react";
import { Search, Filter, Zap, CheckCircle, Clock, Archive } from "lucide-react";
import { FeedbackHeader } from "./header";
import { PostDetailModal } from "./post-detail-modal";
import { RoadmapColumn } from "./roadmap-column";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FeedbackPost } from "@/types/feedback";

interface RoadmapBoardProps {
  initialPosts: FeedbackPost[];
}

export function RoadmapBoard({ initialPosts }: RoadmapBoardProps) {
  const [selectedPost, setSelectedPost] = useState<FeedbackPost | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const getPostsByStatus = (status: string) => {
    return initialPosts.filter((post) => {
      const matchesStatus = post.status === status;
      const matchesSearch =
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.description?.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesStatus && matchesSearch;
    });
  };

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
  ];

  return (
    <div className="min-h-screen bg-background">
      <FeedbackHeader />

      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1">Main Roadmap</h1>
            <p className="text-sm text-muted-foreground">
              Track the progress of Feedbax features and improvements
            </p>
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
            <Button
              variant="outline"
              size="sm"
              aria-label="Filter roadmap items"
            >
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
          <div className="text-xs text-muted-foreground">
            ⚡ Powered by{" "}
            <a
              href="https://github.com/jessequartey/feedbax"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors underline"
            >
              Feedbax
            </a>
          </div>
        </div>
      </div>

      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          isOpen={!!selectedPost}
          onClose={() => setSelectedPost(null)}
        />
      )}
    </div>
  );
}
