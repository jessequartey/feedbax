"use client";

import { useState } from "react";
import {
  ChevronUp,
  MessageSquare,
  Bell,
  BellOff,
  ThumbsUp,
  Reply,
  ChevronRight,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { FeedbackPost, PostStatus } from "./feedback-board";

interface PostDetailModalProps {
  post: FeedbackPost;
  isOpen: boolean;
  onClose: () => void;
}

interface Comment {
  id: string;
  author: string;
  avatar: string;
  content: string;
  createdAt: string;
  likes: number;
}

const mockComments: Comment[] = [
  {
    id: "1",
    author: "Emerald Geyser",
    avatar: "/placeholder.svg?height=32&width=32",
    content:
      "This would probably be the biggest win for me. I will often use the ChatGPT app both for quick tasks on the go as well as asking the question in the app when away from my computer and then returning to it on desktop when I get back to my computer. Not having a mobile app is the biggest thing that is keeping me using ChatGPT on the daily. As soon as a T3 app is available I will be able to switch full time to T3. I even went as far as trying to make my own using expo as a wrapper but failed due to Auth.",
    createdAt: "4 months ago",
    likes: 45,
  },
  {
    id: "2",
    author: "Tomato Astrometry",
    avatar: "/placeholder.svg?height=32&width=32",
    content:
      "I don't really get what's the benefit of a standalone mobile app over just a PWA in this case. You could just install the app to your home screen and if you guys fix some of the bugs and adjust some UI things here and there that would be like 95% of what an app would offer as",
    createdAt: "4 months ago",
    likes: 12,
  },
];

const getStatusColor = (status: PostStatus) => {
  switch (status) {
    case "backlog":
      return "bg-muted text-muted-foreground";
    case "next-up":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
    case "in-progress":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300";
    case "under-review":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300";
    case "done":
      return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
    default:
      return "bg-muted text-muted-foreground";
  }
};

export function PostDetailModal({
  post,
  isOpen,
  onClose,
}: PostDetailModalProps) {
  const [isUpvoted, setIsUpvoted] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [comment, setComment] = useState("");
  const [importance, setImportance] = useState<
    "not-important" | "nice-to-have" | "important" | "essential" | null
  >(null);

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + "k";
    }
    return num.toString();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {post.title}
          </DialogTitle>
        </DialogHeader>
        <div className="flex">
          {/* Main Content */}
          <div className="flex-1 p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <h1 className="text-2xl font-bold mb-4">{post.title}</h1>

                {/* Similar Posts Collapsible */}
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="text-sm text-muted-foreground mb-4 p-0 h-auto"
                    >
                      <ChevronRight className="h-4 w-4 mr-1" />
                      View all similar posts
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 mb-4">
                    <div className="pl-5 space-y-2">
                      <div className="text-sm text-muted-foreground">
                        Similar posts will be shown here...
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Post Content */}
                <div className="space-y-4 mb-6">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="font-medium">
                      Progressive Web App for Learning
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    Add a Web App Manifest to Syllax. This helps students access
                    their learning materials offline and provides a native
                    app-like experience for studying on mobile devices.
                  </p>

                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="font-medium">
                      Enhanced Mobile Experience
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    To be honest, the only thing I want from a mobile learning
                    app is having it be a separate window without browser tabs.
                    That's by definition what PWAs provide and would greatly
                    improve the learning experience...
                  </p>
                </div>

                {/* Importance Voting */}
                <div className="mb-6">
                  <div className="flex items-center space-x-2 mb-3">
                    <span className="text-sm text-muted-foreground">
                      How important is this to you?
                    </span>
                  </div>
                  <div className="flex space-x-2">
                    {[
                      {
                        key: "not-important",
                        label: "Not important",
                        color: "bg-gray-500",
                      },
                      {
                        key: "nice-to-have",
                        label: "Nice to have",
                        color: "bg-yellow-500",
                      },
                      {
                        key: "important",
                        label: "Important",
                        color: "bg-orange-500",
                      },
                      {
                        key: "essential",
                        label: "Essential",
                        color: "bg-red-500",
                      },
                    ].map((option) => (
                      <Button
                        key={option.key}
                        variant={
                          importance === option.key ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setImportance(option.key as any)}
                        className="text-xs"
                      >
                        <div
                          className={`w-2 h-2 rounded-full ${option.color} mr-2`}
                        ></div>
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Comment Section */}
                <div className="space-y-4">
                  <Textarea
                    placeholder="Write a comment..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="min-h-20"
                  />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1">
                      <Button variant="ghost" size="sm">
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button className="bg-pink-600 hover:bg-pink-700">
                      Comment
                    </Button>
                  </div>
                </div>

                {/* Comments */}
                <Tabs defaultValue="comments" className="mt-6">
                  <TabsList>
                    <TabsTrigger value="comments">
                      Comments{" "}
                      <Badge variant="secondary" className="ml-2">
                        50
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="activity">Activity feed</TabsTrigger>
                  </TabsList>

                  <TabsContent value="comments" className="space-y-4 mt-4">
                    <div className="text-sm text-muted-foreground mb-4">
                      Top comments
                    </div>
                    {mockComments.map((comment) => (
                      <div key={comment.id} className="space-y-3">
                        <div className="flex items-start space-x-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage
                              src={comment.avatar || "/placeholder.svg"}
                            />
                            <AvatarFallback>{comment.author[0]}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="font-medium text-sm">
                                {comment.author}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {comment.createdAt}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              {comment.content}
                            </p>
                            <div className="flex items-center space-x-4">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto p-0 text-xs"
                              >
                                <ThumbsUp className="h-3 w-3 mr-1" />
                                {comment.likes}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto p-0 text-xs"
                              >
                                <Reply className="h-3 w-3 mr-1" />
                                Reply
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value="activity">
                    <div className="text-sm text-muted-foreground">
                      Activity feed content...
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-80 border-l border-border p-6 bg-muted/20">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-2">
                <Button
                  variant={isUpvoted ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIsUpvoted(!isUpvoted)}
                  className="flex items-center space-x-1"
                >
                  <ChevronUp className="h-4 w-4" />
                  <span>
                    {formatNumber(post.upvotes + (isUpvoted ? 1 : 0))}
                  </span>
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-sm text-muted-foreground">Upvoters</span>
                <div className="flex items-center space-x-1 mt-1">
                  <ChevronUp className="h-4 w-4 text-pink-500" />
                  <span className="font-medium">
                    {formatNumber(post.upvotes)}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-sm text-muted-foreground">Status</span>
                <div className="mt-1">
                  <Badge
                    className={getStatusColor(post.status)}
                    variant="outline"
                  >
                    {post.status === "next-up"
                      ? "Next up"
                      : post.status === "in-progress"
                      ? "In Progress"
                      : post.status === "under-review"
                      ? "Under Review"
                      : post.status.charAt(0).toUpperCase() +
                        post.status.slice(1)}
                  </Badge>
                </div>
              </div>

              <div>
                <span className="text-sm text-muted-foreground">Board</span>
                <div className="mt-1 text-sm">
                  💡{" "}
                  {post.type === "feature" ? "Feature Request" : "Bug Report"}
                </div>
              </div>

              <div>
                <span className="text-sm text-muted-foreground">Date</span>
                <div className="mt-1 text-sm">{post.createdAt}</div>
              </div>

              <div className="pt-4 border-t border-border">
                <h3 className="font-medium mb-2">Subscribe to post</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Get notified by email when there are changes.
                </p>
                <Button
                  variant={isSubscribed ? "outline" : "default"}
                  size="sm"
                  onClick={() => setIsSubscribed(!isSubscribed)}
                  className={
                    isSubscribed ? "" : "bg-pink-600 hover:bg-pink-700"
                  }
                >
                  {isSubscribed ? (
                    <>
                      <BellOff className="h-4 w-4 mr-2" />
                      Unsubscribe
                    </>
                  ) : (
                    <>
                      <Bell className="h-4 w-4 mr-2" />
                      Get notified
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
