"use client";

import { useState } from "react";
import { MessageSquare, ThumbsUp, Reply, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Comment {
  id: string;
  author: string;
  avatar: string;
  content: string;
  createdAt: string;
  likes: number;
  replies?: Comment[];
}

interface ChangelogCommentsProps {
  entryId: string;
  isOpen: boolean;
  onClose: () => void;
}

const mockComments: Comment[] = [
  {
    id: "1",
    author: "Sarah Chen",
    avatar: "/placeholder.svg?height=32&width=32",
    content:
      "This is amazing! The new AI tutor improvements are exactly what I needed for my calculus studies. The context understanding is so much better now.",
    createdAt: "2 hours ago",
    likes: 12,
    replies: [
      {
        id: "1-1",
        author: "Syllax Team",
        avatar: "/placeholder.svg?height=32&width=32",
        content:
          "Thanks Sarah! We're thrilled to hear the improvements are helping with your studies. Let us know if you have any other feedback!",
        createdAt: "1 hour ago",
        likes: 5,
      },
    ],
  },
  {
    id: "2",
    author: "Mike Rodriguez",
    avatar: "/placeholder.svg?height=32&width=32",
    content:
      "The PWA support is a game changer! I can finally use Syllax offline during my commute. Installation was super smooth on both iOS and Android.",
    createdAt: "4 hours ago",
    likes: 8,
  },
  {
    id: "3",
    author: "Emma Thompson",
    avatar: "/placeholder.svg?height=32&width=32",
    content:
      "Love the performance improvements! The 40% faster response time is really noticeable. My study sessions feel much more fluid now.",
    createdAt: "6 hours ago",
    likes: 15,
  },
  {
    id: "4",
    author: "Alex Kim",
    avatar: "/placeholder.svg?height=32&width=32",
    content:
      "Finally! The quiz saving bug was driving me crazy. So glad it's fixed. Also excited to try out the new personalized learning paths feature.",
    createdAt: "8 hours ago",
    likes: 6,
  },
];

export function ChangelogComments({ isOpen, onClose }: ChangelogCommentsProps) {
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");

  const handleSubmitComment = () => {
    if (newComment.trim()) {
      // Handle comment submission
      setNewComment("");
    }
  };

  const handleSubmitReply = (commentId: string) => {
    if (replyContent.trim()) {
      // Handle reply submission
      setReplyContent("");
      setReplyTo(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <MessageSquare className="h-5 w-5" />
            <span>Comments ({mockComments.length})</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* New Comment */}
          <div className="space-y-3">
            <Textarea
              placeholder="Share your thoughts about this update..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="min-h-20"
            />
            <div className="flex justify-end">
              <Button
                onClick={handleSubmitComment}
                disabled={!newComment.trim()}
              >
                <Send className="h-4 w-4 mr-2" />
                Post Comment
              </Button>
            </div>
          </div>

          {/* Comments List */}
          <ScrollArea className="h-96">
            <div className="space-y-4 pr-4">
              {mockComments.map((comment) => (
                <div key={comment.id} className="space-y-3">
                  <div className="flex items-start space-x-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={comment.avatar || "/placeholder.svg"} />
                      <AvatarFallback>{comment.author[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-sm">
                          {comment.author}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {comment.createdAt}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
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
                          onClick={() => setReplyTo(comment.id)}
                        >
                          <Reply className="h-3 w-3 mr-1" />
                          Reply
                        </Button>
                      </div>

                      {/* Reply Form */}
                      {replyTo === comment.id && (
                        <div className="space-y-2 mt-3">
                          <Textarea
                            placeholder={`Reply to ${comment.author}...`}
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            className="min-h-16 text-sm"
                          />
                          <div className="flex justify-end space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setReplyTo(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSubmitReply(comment.id)}
                              disabled={!replyContent.trim()}
                            >
                              Reply
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Replies */}
                      {comment.replies && comment.replies.length > 0 && (
                        <div className="ml-4 space-y-3 border-l-2 border-border pl-4">
                          {comment.replies.map((reply) => (
                            <div
                              key={reply.id}
                              className="flex items-start space-x-3"
                            >
                              <Avatar className="h-6 w-6">
                                <AvatarImage
                                  src={reply.avatar || "/placeholder.svg"}
                                />
                                <AvatarFallback>
                                  {reply.author[0]}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 space-y-1">
                                <div className="flex items-center space-x-2">
                                  <span className="font-medium text-xs">
                                    {reply.author}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {reply.createdAt}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {reply.content}
                                </p>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-auto p-0 text-xs"
                                >
                                  <ThumbsUp className="h-3 w-3 mr-1" />
                                  {reply.likes}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
