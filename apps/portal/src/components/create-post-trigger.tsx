import { Button } from "@feedbax/ui/components/button";
import { cn } from "@feedbax/ui/lib/utils";
import { Link } from "@tanstack/react-router";

export function CreatePostTrigger({
  className,
  contextual = false,
}: {
  className?: string;
  contextual?: boolean;
}) {
  const link = contextual ? (
    <Link
      to="."
      state={{ createPostOverlay: true }}
      mask={{ to: "/submit", unmaskOnReload: true }}
    />
  ) : (
    <a href="/submit" />
  );

  return (
    <Button
      className={cn("text-sm", className)}
      render={link}
      nativeButton={false}
    >
      New post
    </Button>
  );
}
