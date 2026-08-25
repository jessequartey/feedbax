import { useEffect, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useTheme } from "next-themes";
import { UserCircle } from "lucide-react";
import { z } from "zod";

import { Avatar, AvatarFallback } from "@feedbax/ui/components/avatar";
import { Button } from "@feedbax/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@feedbax/ui/components/dialog";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@feedbax/ui/components/field";
import { Input } from "@feedbax/ui/components/input";

import {
  clearDeviceProfile,
  deriveDeviceProfileInitials,
  readDeviceProfile,
  saveDeviceProfile,
  type DeviceProfile,
} from "../browser-post-state";

const profileSchema = z.object({
  name: z.string().trim().min(1, "Display name is required."),
  email: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || z.email().safeParse(value).success,
      "Enter a valid email address.",
    ),
});

export function ProfileMenu() {
  const [profile, setProfile] = useState<DeviceProfile>();
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    setProfile(readDeviceProfile(localStorage));
  }, []);

  const initials = profile ? deriveDeviceProfileInitials(profile) : undefined;

  function saveProfile(next: DeviceProfile) {
    saveDeviceProfile(localStorage, next);
    setProfile(next);
    setSetupOpen(false);
  }

  function clearProfile() {
    clearDeviceProfile(localStorage);
    setProfile(undefined);
  }

  return (
    <>
      {profile ? (
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
            <DropdownMenuItem onClick={clearProfile}>
              Clear profile
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <>
          <Button
            aria-label="Profile"
            className="h-11 gap-2 px-3 md:h-10"
            variant="outline"
            type="button"
            onClick={() => setSetupOpen(true)}
          >
            <UserCircle aria-hidden="true" />
            <span className="hidden sm:inline">User</span>
          </Button>
          <ProfileSetupDialog
            open={setupOpen}
            onOpenChange={setSetupOpen}
            onSave={saveProfile}
          />
        </>
      )}
    </>
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

function ProfileSetupDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (profile: DeviceProfile) => void;
}) {
  const form = useForm({
    defaultValues: { name: "", email: "" },
    validators: { onSubmit: profileSchema },
    onSubmit: ({ value }) => {
      const email = value.email.trim();
      onSave({
        name: value.name.trim(),
        ...(email ? { email } : {}),
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>
            Saved only on this device. This is not sign-in and cannot be
            recovered.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            form.handleSubmit();
          }}
        >
          <FieldGroup>
            <form.Field
              name="name"
              children={(field) => {
                const isInvalid = field.state.meta.errors.length > 0;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Display name</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.currentTarget.value)
                      }
                      aria-invalid={isInvalid}
                      autoComplete="name"
                    />
                    {isInvalid ? (
                      <FieldError errors={field.state.meta.errors} />
                    ) : (
                      <FieldDescription>
                        Shown next to your contributions on this device.
                      </FieldDescription>
                    )}
                  </Field>
                );
              }}
            />
            <form.Field
              name="email"
              children={(field) => {
                const isInvalid = field.state.meta.errors.length > 0;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      Email (optional)
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.currentTarget.value)
                      }
                      aria-invalid={isInvalid}
                      autoComplete="email"
                    />
                    {isInvalid ? (
                      <FieldError errors={field.state.meta.errors} />
                    ) : null}
                  </Field>
                );
              }}
            />
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Save profile</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
