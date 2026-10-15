import { useConnectedIdentity } from "./connected-identity-provider";
import { useTheme } from "next-themes";
import { UserCircle } from "lucide-react";

import { Avatar, AvatarFallback } from "@feedbax/ui/components/avatar";
import { Button } from "@feedbax/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@feedbax/ui/components/dropdown-menu";
import { deriveDeviceProfileInitials } from "../browser-post-state";
import { useDeviceProfile } from "./device-profile-provider";

export function ProfileMenu() {
  const { profile, openProfileSetup, clearProfile } = useDeviceProfile();

  const identity = useConnectedIdentity();

  const initials = profile ? deriveDeviceProfileInitials(profile) : undefined;

  if (identity.enabled)
    return (
      <div>
        <Button variant="ghost" onClick={openProfileSetup}>
          Contact profile
        </Button>
        {identity.displayName ? (
          <>
            <span>{identity.displayName}</span>
            <Button variant="outline" onClick={() => void identity.signOut()}>
              Sign out
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            disabled={!identity.ready}
            onClick={() => {
              window.location.href = "/internal/identity/start";
            }}
          >
            Sign in
          </Button>
        )}
        {identity.error ? <p role="alert">{identity.error}</p> : null}
      </div>
    );
  return profile ? (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Profile"
            className="h-11 gap-2 px-3 md:h-10"
            variant="outline"
            type="button"
          >
            <Avatar className="size-5">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="max-w-32 truncate">{profile.name}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block truncate">{profile.name}</span>
            {profile.email ? (
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {profile.email}
              </span>
            ) : null}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <ThemeMenuItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={openProfileSetup}>
          Edit profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={clearProfile}>
          Clear profile
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <Button
      aria-label="Profile"
      className="h-11 gap-2 px-3 md:h-10"
      variant="outline"
      type="button"
      onClick={openProfileSetup}
    >
      <UserCircle aria-hidden="true" />
      <span className="hidden sm:inline">Add profile</span>
    </Button>
  );
}

function ThemeMenuItems() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenuRadioGroup
      value={theme ?? "system"}
      onValueChange={(value) => setTheme(value as string)}
    >
      <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  );
}
