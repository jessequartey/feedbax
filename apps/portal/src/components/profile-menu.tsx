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

  const initials = profile ? deriveDeviceProfileInitials(profile) : undefined;

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
      <span className="hidden sm:inline">User</span>
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
