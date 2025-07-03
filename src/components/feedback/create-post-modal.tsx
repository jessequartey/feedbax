"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPostAction } from "@/lib/actions";
import { FeedbackPost } from "@/types/feedback";
import { useAuth } from "@/lib/use-auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { appConfig } from "@/config";

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
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [postType, setPostType] = useState<"feature" | "bug">("feature");
  const [isPending, setIsPending] = useState(false);

       const handleOptimisticPost = (postData: {
    title: string;
    description: string;
    type: string;
    submitterEmail: string;
  }): FeedbackPost | null => {
    if (!user) return null;

    const optimisticPost: FeedbackPost = {
      id: `optimistic-${Date.now()}`,
      title: postData.title,
      description: postData.description,
      type: postData.type as "feature" | "bug",
      status: "backlog",
      upvotes: 0,
      comments: 0,
      author: user.name,
      authorId: `user-${btoa(user.email).substring(0, 8)}`,
      avatar: user.image || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}`,
      createdAt: new Date().toISOString().split("T")[0],
      tags: [],
      subscribed: false,
    };

    // Add to the beginning of the posts array
    const updatedPosts = [optimisticPost, ...currentPosts];
    onOptimisticUpdate(updatedPosts);

    return optimisticPost;
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error(appConfig.auth.signInPrompt);
      return;
    }

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
      submitterEmail: user.email,
    };

    // Create optimistic post
    const optimisticPost = handleOptimisticPost(postData);

    if (!optimisticPost) {
      setIsPending(false);
      return;
    }

    try {
      // Execute the server action
      const result = await createPostAction(postData);

      if (result?.data?.success) {
        toast.success(appConfig.postCreation.successMessage);

        // Replace the optimistic post with the real post data
        const realPost = result.data.data;
        if (realPost) {
          const updatedPosts = [optimisticPost, ...currentPosts].map((post) =>
            post.id === optimisticPost.id ? realPost : post
          );
          onOptimisticUpdate(updatedPosts);
        }

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
      toast.error(appConfig.postCreation.errorMessage);
      // Revert optimistic update on error
      onOptimisticUpdate(currentPosts);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Post</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="type">Post Type</Label>
            <Select
              value={postType}
              onValueChange={(value) => setPostType(value as "feature" | "bug")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select post type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="feature">Feature Request</SelectItem>
                <SelectItem value="bug">Bug Report</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Input
            placeholder={appConfig.postCreation.placeholder.title}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-lg font-medium"
          />

          <div className="space-y-2">
            <Textarea
              placeholder={appConfig.postCreation.placeholder.description}
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
                    appConfig.postCreation.submitButton
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
