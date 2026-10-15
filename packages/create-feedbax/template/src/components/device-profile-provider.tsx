import { ConnectedIdentityProvider } from "./connected-identity-provider";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useForm } from "@tanstack/react-form";
import { UserRound } from "lucide-react";
import { z } from "zod";

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
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@feedbax/ui/components/item";
import { Skeleton } from "@feedbax/ui/components/skeleton";
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
  isCompleteDeviceProfile,
  readDeviceProfile,
  saveDeviceProfile,
  type CompleteDeviceProfile,
  type DeviceProfile,
} from "../browser-post-state";

const profileSchema = z.object({
  name: z.string().trim().min(1, "Display name is required."),
  email: z
    .string()
    .trim()
    .refine((value) => value.length > 0, "Email is required.")
    .refine(
      (value) => value === "" || z.email().safeParse(value).success,
      "Enter a valid email address.",
    ),
});

type DeviceProfileContextValue = {
  profile?: DeviceProfile;
  completeProfile?: CompleteDeviceProfile;
  ready: boolean;
  openProfileSetup: () => void;
  clearProfile: () => void;
};

const DeviceProfileContext = createContext<DeviceProfileContextValue | null>(
  null,
);

export function DeviceProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<DeviceProfile>();
  const [ready, setReady] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setProfile(readDeviceProfile(localStorage));
      setReady(true);
    };
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  const value = useMemo<DeviceProfileContextValue>(
    () => ({
      profile,
      completeProfile: isCompleteDeviceProfile(profile) ? profile : undefined,
      ready,
      openProfileSetup: () => setSetupOpen(true),
      clearProfile: () => {
        clearDeviceProfile(localStorage);
        setProfile(undefined);
      },
    }),
    [profile, ready],
  );

  return (
    <DeviceProfileContext.Provider value={value}>
      <ConnectedIdentityProvider>{children}</ConnectedIdentityProvider>
      {setupOpen ? (
        <ProfileSetupDialog
          initialProfile={profile}
          open
          onOpenChange={setSetupOpen}
          onSave={(next) => {
            saveDeviceProfile(localStorage, next);
            setProfile(next);
            setSetupOpen(false);
          }}
        />
      ) : null}
    </DeviceProfileContext.Provider>
  );
}

export function useDeviceProfile() {
  const context = useContext(DeviceProfileContext);
  const [standaloneProfile, setStandaloneProfile] = useState<DeviceProfile>();
  const [standaloneReady, setStandaloneReady] = useState(false);

  useEffect(() => {
    if (context) return;
    const refresh = () => {
      setStandaloneProfile(readDeviceProfile(localStorage));
      setStandaloneReady(true);
    };
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [context]);

  const standalone = useMemo<DeviceProfileContextValue>(
    () => ({
      profile: standaloneProfile,
      completeProfile: isCompleteDeviceProfile(standaloneProfile)
        ? standaloneProfile
        : undefined,
      ready: standaloneReady,
      openProfileSetup: () => undefined,
      clearProfile: () => {
        clearDeviceProfile(localStorage);
        setStandaloneProfile(undefined);
      },
    }),
    [standaloneProfile, standaloneReady],
  );

  return context ?? standalone;
}

export function DeviceProfilePrompt({
  purpose,
}: {
  purpose: "comment" | "post";
}) {
  const id = useId();
  const { profile, ready, openProfileSetup } = useDeviceProfile();

  if (!ready)
    return (
      <div
        className="my-4 flex items-center gap-3"
        aria-label="Loading profile"
        aria-busy
      >
        <Skeleton className="size-8" />
        <Skeleton className="h-4 w-48" />
      </div>
    );

  const incomplete = Boolean(profile);
  return (
    <Item variant="muted" size="sm" className="my-4" aria-labelledby={id}>
      <ItemMedia variant="icon">
        <UserRound aria-hidden="true" />
      </ItemMedia>
      <ItemContent className="min-w-36">
        <ItemTitle id={id}>
          {incomplete ? "Complete your profile" : "Add your profile"}
        </ItemTitle>
        <ItemDescription className="line-clamp-none">
          {purpose === "comment"
            ? "Add a name and email to comment."
            : "Add a name and email to create a Post."}{" "}
          Email stays private. Details are unverified.
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openProfileSetup}
        >
          {incomplete ? "Complete profile" : "Add profile"}
        </Button>
      </ItemActions>
    </Item>
  );
}

function ProfileSetupDialog({
  initialProfile,
  open,
  onOpenChange,
  onSave,
}: {
  initialProfile?: DeviceProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (profile: CompleteDeviceProfile) => void;
}) {
  const form = useForm({
    defaultValues: {
      name: initialProfile?.name ?? "",
      email: initialProfile?.email ?? "",
    },
    validators: { onSubmit: profileSchema },
    onSubmit: ({ value }) =>
      onSave({ name: value.name.trim(), email: value.email.trim() }),
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
                      required
                    />
                    {isInvalid ? (
                      <FieldError errors={field.state.meta.errors} />
                    ) : (
                      <FieldDescription>
                        Shown next to your public contributions.
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
                    <FieldLabel htmlFor={field.name}>Email</FieldLabel>
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
                      required
                    />
                    {isInvalid ? (
                      <FieldError errors={field.state.meta.errors} />
                    ) : (
                      <FieldDescription>
                        Required for Posts and Comments. Never shown publicly.
                      </FieldDescription>
                    )}
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
