import { Button } from "@feedbax/ui/components/button";
import { cn } from "@feedbax/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { useDeviceProfile } from "./device-profile-provider";

export function CreatePostTrigger({
  className,
  contextual = false,
}: {
  className?: string;
  contextual?: boolean;
}) {
  const { completeProfile, ready, openProfileSetup } = useDeviceProfile();
  if (!ready || !completeProfile)
    return (
      <Button
        className={cn("text-sm", className)}
        type="button"
        onClick={openProfileSetup}
      >
        New post
      </Button>
    );

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
