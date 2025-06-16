"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User } from "@/types/auth";

interface UserAvatarProps {
  user: User;
  size?: "sm" | "md" | "lg";
}

export function UserAvatar({ user, size = "md" }: UserAvatarProps) {
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  };

  // Generate initials from name
  const getInitials = (name: string): string => {
    return name
      .split(" ")
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Avatar className={sizeClasses[size]}>
      {user.image && (
        <AvatarImage src={user.image} alt={`${user.name}'s avatar`} />
      )}
      <AvatarFallback className="bg-primary/10 text-primary font-medium">
        {getInitials(user.name)}
      </AvatarFallback>
    </Avatar>
  );
}
