import type { Post, PostType, SubmittedPost } from "@feedbax/feedback";
import { useForm } from "@tanstack/react-form";
import { useEffect, useRef, useState } from "react";
import * as z from "zod";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@feedbax/ui/components/alert-dialog";
import { Button } from "@feedbax/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@feedbax/ui/components/field";
import { Input } from "@feedbax/ui/components/input";
import { RadioGroup, RadioGroupItem } from "@feedbax/ui/components/radio-group";
import { Textarea } from "@feedbax/ui/components/textarea";
import {
  Bug,
  Lightbulb,
  MessageSquareText,
  type LucideIcon,
} from "lucide-react";

import {
  readDeviceProfile,
  removeCapability,
  retainCapability,
} from "./browser-post-state";
import { isCapabilityAuthorizationFailure } from "./capability-authorization-error";

const draftStorageKey = "feedbax:portal-draft";
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as
  string | undefined;

export interface StoredDraft {
  id: string;
  browserCapability: string;
  title: string;
  description: string;
  type: PostType;
}

export interface PortalFeedbackMutations {
  submitPost(input: { data: unknown }): Promise<SubmittedPost>;
  editDraftPost(input: { data: unknown }): Promise<Post>;
  withdrawDraftPost(input: { data: unknown }): Promise<void>;
}

const postTypeOptions = [
  {
    type: "Feature Request",
    description: "Suggest an improvement",
    icon: Lightbulb,
  },
  {
    type: "Bug Report",
    description: "Report unexpected behavior",
    icon: Bug,
  },
  {
    type: "General Feedback",
    description: "Share an observation",
    icon: MessageSquareText,
  },
] as const satisfies readonly {
  type: PostType;
  description: string;
  icon: LucideIcon;
}[];

const feedbackFormSchema = z.object({
  title: z
    .string()
    .max(160, "Title must be at most 160 characters.")
    .refine((value) => value.trim().length > 0, "Enter a title."),
  description: z
    .string()
    .max(5_000, "Description must be at most 5,000 characters.")
    .refine((value) => value.trim().length > 0, "Enter a description."),
  type: z.enum(postTypeOptions.map(({ type }) => type)),
});

type FeedbackFormValues = z.infer<typeof feedbackFormSchema>;

export function PortalFeedbackForm({
  initialDraft,
  display = "page",
  onCancel,
  onCreated,
  onEdited,
  onAuthorizationLost,
  mutations,
  showWithdrawal = true,
}: {
  initialDraft?: StoredDraft;
  display?: "page" | "overlay";
  onCancel?: () => void;
  onCreated?: (post: SubmittedPost) => void | Promise<void>;
  onEdited?: (post: Post) => void | Promise<void>;
  onAuthorizationLost?: () => void;
  mutations: PortalFeedbackMutations;
  showWithdrawal?: boolean;
}) {
  const [draft, setDraft] = useState<StoredDraft | undefined>(initialDraft);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [confirmingWithdrawal, setConfirmingWithdrawal] = useState(false);
  const turnstileToken = useRef<string | undefined>(undefined);
  const form = useForm({
    defaultValues: {
      title: initialDraft?.title ?? "",
      description: initialDraft?.description ?? "",
      type: initialDraft?.type ?? ("Feature Request" as PostType),
    },
    validators: { onSubmit: feedbackFormSchema },
    onSubmit: async ({ value }) => {
      if (draft) await edit(value);
      else await submit(value);
    },
  });

  useEffect(() => {
    if (!turnstileSiteKey || document.querySelector("script[data-turnstile]")) {
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = "true";
    document.head.append(script);
  }, []);

  async function submit(values: FeedbackFormValues) {
    if (!browserCanStoreDraft()) {
      setMessage(
        "Enable browser storage before submitting so this browser can retain draft access.",
      );
      return;
    }
    setPending(true);
    setMessage(undefined);
    try {
      const result = await mutations.submitPost({
        data: {
          ...values,
          ...(turnstileToken.current
            ? { turnstileToken: turnstileToken.current }
            : {}),
          submitter: readDeviceProfile(window.localStorage),
        },
      });
      const storedDraft: StoredDraft = {
        id: result.id,
        browserCapability: result.browserCapability,
        title: values.title,
        description: values.description,
        type: values.type,
      };
      setDraft(storedDraft);
      try {
        retainCapability(window.localStorage, {
          id: result.id,
          slug: result.slug,
          browserCapability: result.browserCapability,
        });
        window.localStorage.setItem(
          draftStorageKey,
          JSON.stringify(storedDraft),
        );
      } catch {
        setMessage(
          "Draft submitted, but this browser could not save access. Keep this page open to manage it.",
        );
        return;
      }
      setMessage(
        "Draft submitted. You can edit or withdraw it from this browser.",
      );
      if (onCreated) await onCreated(result);
      else window.location.assign(`/p/${encodeURIComponent(result.slug)}`);
    } catch (error) {
      setMessage(submissionFailureMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function edit(values: FeedbackFormValues) {
    if (!draft) return;
    setPending(true);
    setMessage(undefined);
    try {
      const edited = await mutations.editDraftPost({
        data: {
          id: draft.id,
          browserCapability: draft.browserCapability,
          ...values,
        },
      });
      const storedDraft = { ...draft, ...values };
      window.localStorage.setItem(draftStorageKey, JSON.stringify(storedDraft));
      setDraft(storedDraft);
      setMessage("Draft updated.");
      await onEdited?.(edited);
    } catch (error) {
      if (isCapabilityAuthorizationFailure(error)) onAuthorizationLost?.();
      setMessage(draftFailureMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function withdraw() {
    if (!draft) return;
    setPending(true);
    setMessage(undefined);
    try {
      await mutations.withdrawDraftPost({
        data: {
          id: draft.id,
          browserCapability: draft.browserCapability,
        },
      });
      window.localStorage.removeItem(draftStorageKey);
      removeCapability(window.localStorage, draft.id);
      setDraft(undefined);
      setMessage("Draft withdrawn.");
      window.location.assign("/");
    } catch (error) {
      setMessage(draftFailureMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="feedback-submit"
      data-display={display}
      aria-labelledby="submit-heading"
    >
      <div className="feedback-submit-copy">
        <p className="feedback-eyebrow">Share feedback</p>
        <h2 id="submit-heading">
          {draft ? "Manage your Draft Post." : "Create a Post"}
        </h2>
        <p>
          Draft access is stored only in this browser. It does not verify your
          identity, cannot be moved to another device, and cannot be recovered
          if browser storage is cleared.
        </p>
      </div>

      <form
        className="feedback-submit-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const token = new FormData(event.currentTarget).get(
            "cf-turnstile-response",
          );
          turnstileToken.current = token ? String(token) : undefined;
          form.handleSubmit();
        }}
      >
        <FieldGroup>
          <form.Field
            name="title"
            children={(field) => {
              const isInvalid = field.state.meta.errors.length > 0;
              return (
                <Field
                  className="feedback-submit-field"
                  data-invalid={isInvalid}
                >
                  <FieldLabel htmlFor={field.name}>Title</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    required
                    maxLength={160}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(event.currentTarget.value)
                    }
                    aria-invalid={isInvalid}
                  />
                  {isInvalid ? (
                    <FieldError errors={field.state.meta.errors} />
                  ) : null}
                </Field>
              );
            }}
          />
          {turnstileSiteKey && !draft ? (
            <div
              className="cf-turnstile"
              data-sitekey={turnstileSiteKey}
              data-theme="light"
            />
          ) : null}
          <form.Field
            name="description"
            children={(field) => {
              const isInvalid = field.state.meta.errors.length > 0;
              return (
                <Field
                  className="feedback-submit-field"
                  data-invalid={isInvalid}
                >
                  <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                  <Textarea
                    id={field.name}
                    name={field.name}
                    required
                    maxLength={5_000}
                    rows={6}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(event.currentTarget.value)
                    }
                    aria-invalid={isInvalid}
                    aria-describedby="description-count"
                  />
                  <FieldDescription
                    id="description-count"
                    className="feedback-character-count"
                  >
                    {field.state.value.length.toLocaleString("en-US")} / 5,000
                    characters
                  </FieldDescription>
                  {isInvalid ? (
                    <FieldError errors={field.state.meta.errors} />
                  ) : null}
                </Field>
              );
            }}
          />
          <form.Field
            name="type"
            children={(field) => {
              const isInvalid = field.state.meta.errors.length > 0;
              return (
                <Field
                  className="feedback-submit-field"
                  data-invalid={isInvalid}
                >
                  <FieldLabel id={`${field.name}-label`}>Post Type</FieldLabel>
                  <RadioGroup
                    aria-labelledby={`${field.name}-label`}
                    aria-invalid={isInvalid}
                    className="feedback-post-type-picker"
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onValueChange={(value) => field.handleChange(value)}
                  >
                    {postTypeOptions.map(
                      ({ description, icon: Icon, type }) => (
                        <FieldLabel
                          className="feedback-post-type-card"
                          key={type}
                        >
                          <RadioGroupItem
                            aria-invalid={isInvalid}
                            value={type}
                          />
                          <Icon aria-hidden="true" />
                          <span className="feedback-post-type-copy">
                            <strong>{type}</strong>
                            <small>{description}</small>
                          </span>
                        </FieldLabel>
                      ),
                    )}
                  </RadioGroup>
                  {isInvalid ? (
                    <FieldError errors={field.state.meta.errors} />
                  ) : null}
                </Field>
              );
            }}
          />
        </FieldGroup>
        <div className="feedback-submit-actions">
          <Button type="submit" disabled={pending}>
            {pending ? "Working…" : draft ? "Save changes" : "Create Post"}
          </Button>
          {display === "overlay" ? (
            <Button
              type="button"
              variant="ghost"
              className="feedback-cancel"
              onClick={onCancel}
              disabled={pending}
            >
              Cancel
            </Button>
          ) : null}
          {draft && showWithdrawal ? (
            <Button
              type="button"
              variant="destructive"
              className="feedback-withdraw"
              onClick={() => setConfirmingWithdrawal(true)}
              disabled={pending}
            >
              Withdraw draft
            </Button>
          ) : null}
        </div>
        {message ? (
          <p className="feedback-submit-message" role="status">
            {message}
          </p>
        ) : null}
      </form>
      <AlertDialog
        open={confirmingWithdrawal}
        onOpenChange={setConfirmingWithdrawal}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Withdraw this Draft Post permanently?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={withdraw}>
              Withdraw Draft Post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function submissionFailureMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : "";
  if (detail.includes("rate limit")) {
    return "Too many submissions were attempted. Please wait and try again.";
  }
  if (detail.includes("verification")) {
    if (!turnstileSiteKey) {
      return "Spam protection is not configured correctly. Please contact the Product Team.";
    }
    return "Spam verification did not complete. Please retry the challenge.";
  }
  if (detail.includes("invalid")) {
    return "Check the required fields and their length, then try again.";
  }
  return "Feedback could not be submitted. Please try again.";
}

function browserCanStoreDraft(): boolean {
  const key = `${draftStorageKey}:check`;
  try {
    window.localStorage.setItem(key, "available");
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function draftFailureMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : "";
  if (detail.includes("did not authorize")) {
    return "This draft is no longer editable from this browser.";
  }
  if (detail.includes("invalid")) {
    return "Check the required fields and their length, then try again.";
  }
  return "The draft could not be changed. Please try again.";
}
