"use client";

import { useState, useCallback, useMemo } from "react";
import {
  ChevronUp,
  MessageSquare,
  Bell,
  BellOff,
  ThumbsUp,
  Reply,
  ChevronRight,
  X,
  Lightbulb,
  Bug,
  Zap,
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
import type { FeedbackPost, PostStatus, PostType } from "@/types/feedback";

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

  const getPostTypeText = useCallback((type: PostType): string => {
    switch (type) {
      case "feature":
        return "Feature Request";
      case "bug":
        return "Bug Report";
      case "improvement":
        return "Improvement";
      case "question":
        return "Question";
      default:
        return type;
    }
  }, []);

  const PostTypeIcon = useMemo(() => {
    switch (post.type) {
      case "feature":
        return Lightbulb;
      case "bug":
        return Bug;
      case "improvement":
        return Zap;
      case "question":
        return MessageSquare;
      default:
        return Lightbulb;
    }
  }, [post.type]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="md:min-w-4xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{post.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col lg:flex-row">
          {/* Main Content */}
          <div className="flex-1 p-4 md:p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                {/* Post Type Badge */}
                <div className="flex items-center space-x-2 mb-4">
                  <PostTypeIcon className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                  <Badge
                    variant="secondary"
                    className="text-xs md:text-sm font-medium px-2 md:px-3 py-1"
                  >
                    {getPostTypeText(post.type)}
                  </Badge>
                </div>

                <h1 className="text-xl md:text-2xl font-bold mb-4">
                  {post.title}
                </h1>

                {/* Post Description */}
                {post.description && (
                  <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                    {post.description}
                  </p>
                )}

                {/* Similar Posts Section */}
                <div className="mb-6">
                  <h2 className="text-lg font-semibold mb-4">Similar Posts</h2>
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
                </div>

                {/* Importance Voting */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-foreground mb-3">
                    How important is this to you?
                  </h3>
                  <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2">
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
                        className={`text-xs transition-all ${
                          importance === option.key
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "hover:bg-muted"
                        }`}
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

                  <div className="flex items-center justify-end">
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
          <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-border p-4 md:p-6 bg-muted/20">
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
                <div className="mt-1 flex items-center space-x-2">
                  <PostTypeIcon className="h-4 w-4" />
                  <span className="text-sm">{getPostTypeText(post.type)}</span>
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
      </DialogContent>
    </Dialog>
  );
}
