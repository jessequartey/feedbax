"use client";

import { useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createPostAction } from "@/lib/actions";
import { mockUser } from "@/types/user";
import { toast } from "sonner";
import type { PostType, FeedbackPost } from "@/types/feedback";

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPosts: FeedbackPost[];
  onOptimisticUpdate: (posts: FeedbackPost[]) => void;
}

export function CreatePostModal({
  isOpen,
  onClose,
  currentPosts,
  onOptimisticUpdate,
}: CreatePostModalProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [postType, setPostType] = useState<PostType>("feature");

  const [isPending, setIsPending] = useState(false);

  const handleOptimisticPost = useCallback(
    (newPostData: { title: string; description: string; type: PostType }) => {
      // Create optimistic post
      const optimisticPost: FeedbackPost = {
        id: `temp-${Date.now()}`, // Temporary ID
        title: newPostData.title,
        description: newPostData.description || "No description provided",
        type: newPostData.type,
        status: "backlog",
        upvotes: 1, // Start with 1 vote as per requirement
        downvotes: 0,
        comments: 0,
        author: mockUser.name,
        authorId: mockUser.email,
        avatar: mockUser.image,
        createdAt: "Just now",
        updatedAt: "Just now",
        tags: [],
      };

      const updatedPosts = [optimisticPost, ...currentPosts];
      onOptimisticUpdate(updatedPosts);
      return optimisticPost;
    },
    [currentPosts, onOptimisticUpdate]
  );

  const handleSubmit = async () => {
    // Client-side validation - title is required, description is optional
    if (!title.trim()) {
      toast.error("Please enter a title for your post");
      return;
    }

    if (title.trim().length > 200) {
      toast.error("Title must be less than 200 characters");
      return;
    }

    if (content.trim().length > 2000) {
      toast.error("Description must be less than 2000 characters");
      return;
    }

    setIsPending(true);

    const postData = {
      title: title.trim(),
      description: content.trim() || "No description provided",
      type: postType,
    };

    // Create optimistic post
    const optimisticPost = handleOptimisticPost(postData);

    try {
      // Execute the server action
      const result = await createPostAction(postData);

      if (result?.data?.success) {
        toast.success("Post created successfully! 🎉");
        // Reset form
        setTitle("");
        setContent("");
        setPostType("feature");
        onClose();
      } else {
        throw new Error("Failed to create post");
      }
    } catch (error) {
      console.error("Error creating post:", error);
      toast.error("Failed to create post. Please try again.");
      // Revert optimistic update on error
      onOptimisticUpdate(currentPosts);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <DialogTitle className="sr-only">Create New Post</DialogTitle>
          <div className="flex items-center space-x-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={mockUser.image} alt={mockUser.name} />
              <AvatarFallback>{mockUser.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <Select
              value={postType}
              onValueChange={(value: PostType) => setPostType(value)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="feature">Feature Request</SelectItem>
                <SelectItem value="bug">Bug Report</SelectItem>
                <SelectItem value="improvement">Improvement</SelectItem>
                <SelectItem value="question">Question</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            placeholder="Title of your post"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-lg font-medium"
          />

          <div className="space-y-2">
            <Textarea
              placeholder="

1. Search before posting! Your feedback has likely been submitted already
2. If you have multiple items to request, please create separate posts for each.
3. If submitting a bug, please include steps to reproduce and expected behavior"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-32 resize-none"
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center justify-end">
                <Button
                  onClick={handleSubmit}
                  className="bg-pink-600 hover:bg-pink-700"
                  disabled={!title.trim() || isPending}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Submit Post"
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
