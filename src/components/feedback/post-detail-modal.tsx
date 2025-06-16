"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
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
  Loader2,
  Shield,
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
import { createCommentAction } from "@/lib/actions";
import { useAuth } from "@/lib/use-auth";
import { useVoting } from "@/lib/hooks/use-voting";
import { toast } from "sonner";
import type {
  FeedbackPost,
  PostStatus,
  PostType,
  FeedbackComment,
} from "@/types/feedback";

interface PostDetailModalProps {
  post: FeedbackPost;
  isOpen: boolean;
  onClose: () => void;
}

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
  const { user } = useAuth();
  const { hasVoted, voteOnPost, isVotingOnPost, getOptimisticVoteCount } =
    useVoting();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [importance, setImportance] = useState<
    "not-important" | "nice-to-have" | "important" | "essential" | null
  >(null);

  // Fetch comments when modal opens
  useEffect(() => {
    if (isOpen && post.notionPageId) {
      fetchComments();
    }
  }, [isOpen, post.notionPageId]);

  const fetchComments = async () => {
    if (!post.notionPageId) return;

    setIsLoadingComments(true);
    try {
      const response = await fetch(`/api/comments/${post.notionPageId}`);
      if (response.ok) {
        const data = (await response.json()) as { comments: FeedbackComment[] };
        setComments(data.comments);
      } else {
        console.error("Failed to fetch comments:", response.statusText);
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
    } finally {
      setIsLoadingComments(false);
    }
  };

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

  const handleSubmitComment = async () => {
    if (!user) {
      toast.error("Please sign in to comment");
      return;
    }

    if (!comment.trim()) {
      toast.error("Please enter a comment");
      return;
    }

    if (comment.trim().length > 2000) {
      toast.error("Comment must be less than 2000 characters");
      return;
    }

    if (!post.notionPageId) {
      toast.error("Cannot add comment to this post");
      return;
    }

    setIsSubmittingComment(true);

    const commentData = {
      postId: post.notionPageId,
      content: comment.trim(),
      authorName: user.name,
      authorEmail: user.email,
      authorAvatar: user.image || "",
    };

    // Create optimistic comment
    const optimisticComment: FeedbackComment = {
      id: `temp-${Date.now()}`,
      postId: post.notionPageId,
      content: commentData.content,
      author: commentData.authorName,
      authorId: user.email,
      avatar: user.image || undefined,
      createdAt: "Just now",
    };

    // Add optimistic comment to the list
    const updatedComments = [optimisticComment, ...comments];
    setComments(updatedComments);

    try {
      const result = await createCommentAction(commentData);

      if (result?.data?.success) {
        toast.success("Comment added successfully! 💬");
        setComment("");
        // Refresh comments to get the real comment from server
        await fetchComments();
      } else {
        throw new Error("Failed to create comment");
      }
    } catch (error) {
      console.error("Error creating comment:", error);
      toast.error("Failed to add comment. Please try again.");
      // Revert optimistic update on error
      setComments(comments);
    } finally {
      setIsSubmittingComment(false);
    }
  };

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
                    disabled={isSubmittingComment}
                  />

                  <div className="flex items-center justify-end">
                    <Button
                      className="bg-pink-600 hover:bg-pink-700"
                      onClick={handleSubmitComment}
                      disabled={!comment.trim() || isSubmittingComment}
                    >
                      {isSubmittingComment ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        "Comment"
                      )}
                    </Button>
                  </div>
                </div>

                {/* Comments */}
                <Tabs defaultValue="comments" className="mt-6">
                  <TabsList>
                    <TabsTrigger value="comments">
                      Comments{" "}
                      <Badge variant="secondary" className="ml-2">
                        {comments.length}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="activity">Activity feed</TabsTrigger>
                  </TabsList>

                  <TabsContent value="comments" className="space-y-4 mt-4">
                    {isLoadingComments ? (
                      <div className="text-center py-4">
                        <div className="text-sm text-muted-foreground">
                          Loading comments...
                        </div>
                      </div>
                    ) : comments.length > 0 ? (
                      <div className="space-y-4">
                        {comments.map((comment) => (
                          <div
                            key={comment.id}
                            className={`flex items-start space-x-3 p-4 border rounded-lg ${
                              comment.isAuthorResponse
                                ? "border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20"
                                : ""
                            }`}
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={comment.avatar} />
                              <AvatarFallback>
                                {comment.isAuthorResponse ? (
                                  <Shield className="h-4 w-4 text-blue-600" />
                                ) : (
                                  comment.author[0]
                                )}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-sm">
                                  {comment.author}
                                </span>
                                {comment.isAuthorResponse && (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                                  >
                                    <Shield className="h-3 w-3 mr-1" />
                                    Admin
                                  </Badge>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {comment.createdAt}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {comment.content}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-medium mb-2">
                          No comments yet
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Be the first to share your thoughts on this feedback.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            document.querySelector("textarea")?.focus()
                          }
                        >
                          Write the first comment
                        </Button>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="activity">
                    <div className="text-center py-8">
                      <div className="text-sm text-muted-foreground">
                        Activity feed will show status changes, updates, and
                        other events.
                      </div>
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
                  variant={hasVoted(post.id) ? "default" : "outline"}
                  size="sm"
                  onClick={async () => {
                    await voteOnPost(post);
                  }}
                  disabled={isVotingOnPost(post.id)}
                  className="flex items-center space-x-1"
                >
                  {isVotingOnPost(post.id) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                  <span>{formatNumber(getOptimisticVoteCount(post))}</span>
                </Button>
              </div>
            </div>

            <div className="space-y-4">
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
