import type { FeedbackType } from "@feedbax/feedback";
import { useEffect, useState, type FormEvent } from "react";
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

import {
  editPortalFeedbackDraft,
  submitPortalPost,
  withdrawPortalFeedbackDraft,
} from "./portal-feedback-server-function";
import {
  readDeviceProfile,
  removeCapability,
  retainCapability,
} from "./browser-post-state";

const draftStorageKey = "feedbax:portal-draft";
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as
  string | undefined;

export interface StoredDraft {
  id: string;
  browserCapability: string;
  title: string;
  description: string;
  type: FeedbackType;
}

const feedbackTypes: FeedbackType[] = [
  "Feature Request",
  "Bug Report",
  "General Feedback",
];

export function PortalFeedbackForm({
  initialDraft,
}: { initialDraft?: StoredDraft } = {}) {
  const [draft, setDraft] = useState<StoredDraft | undefined>(initialDraft);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [confirmingWithdrawal, setConfirmingWithdrawal] = useState(false);

  useEffect(() => {
    if (initialDraft) return;
    const stored = window.localStorage.getItem(draftStorageKey);
    if (!stored) return;
    try {
      setDraft(JSON.parse(stored) as StoredDraft);
    } catch {
      window.localStorage.removeItem(draftStorageKey);
    }
  }, [initialDraft]);

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = readFeedbackForm(form);
    if (!browserCanStoreDraft()) {
      setMessage(
        "Enable browser storage before submitting so this browser can retain draft access.",
      );
      return;
    }
    setPending(true);
    setMessage(undefined);
    try {
      const result = await submitPortalPost({
        data: { ...values, submitter: readDeviceProfile(window.localStorage) },
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
      window.location.assign(`/p/${encodeURIComponent(result.slug)}`);
    } catch (error) {
      setMessage(submissionFailureMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const values = readFeedbackForm(event.currentTarget);
    setPending(true);
    setMessage(undefined);
    try {
      await editPortalFeedbackDraft({
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
    } catch (error) {
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
      await withdrawPortalFeedbackDraft({
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
    <section className="feedback-submit" aria-labelledby="submit-heading">
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

      <form onSubmit={draft ? edit : submit} className="feedback-submit-form">
        <label>
          <span>Title</span>
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={draft?.title}
            key={`title-${draft?.id ?? "new"}`}
          />
        </label>
        {turnstileSiteKey && !draft ? (
          <div
            className="cf-turnstile"
            data-sitekey={turnstileSiteKey}
            data-theme="light"
          />
        ) : null}
        <label>
          <span>Description</span>
          <textarea
            name="description"
            required
            maxLength={5_000}
            rows={6}
            defaultValue={draft?.description}
            key={`description-${draft?.id ?? "new"}`}
          />
        </label>
        <label>
          <span>Feedback type</span>
          <select
            name="type"
            defaultValue={draft?.type ?? "Feature Request"}
            key={`type-${draft?.id ?? "new"}`}
          >
            {feedbackTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <div className="feedback-submit-actions">
          <button type="submit" disabled={pending}>
            {pending ? "Working…" : draft ? "Save changes" : "Create Post"}
          </button>
          {draft ? (
            <button
              type="button"
              className="feedback-withdraw"
              onClick={() => setConfirmingWithdrawal(true)}
              disabled={pending}
            >
              Withdraw draft
            </button>
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

function readFeedbackForm(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    title: String(data.get("title") ?? ""),
    description: String(data.get("description") ?? ""),
    type: String(data.get("type") ?? "") as FeedbackType,
    ...(data.get("cf-turnstile-response")
      ? { turnstileToken: String(data.get("cf-turnstile-response")) }
      : {}),
  };
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
