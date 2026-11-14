"use client";

// <FeedbaxDialog />: send feedback with an annotated screenshot to your Feedbax portal.
// Flow: choose a type → describe → optionally capture or attach a screenshot → annotate → send.
// Built only from your own shadcn primitives and theme tokens; it adds no global CSS.
import * as React from "react";
import { Bug, Check, Lightbulb, MessageSquare, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { emptyHistory, exportImage, type History } from "@/lib/feedbax/annotation";
import {
  CaptureCancelledError,
  canCaptureScreen as screenCaptureSupported,
  captureScreen,
  captureViewport,
  waitUntilGone,
} from "@/lib/feedbax/capture";
import {
  createTokenGetter,
  describeSubmitError,
  signInUrl,
  submitFeedback,
  type ErrorView,
  type GetToken,
} from "@/lib/feedbax/client";
import { draftReducer, emptyDraft, hasContent, uuid } from "@/lib/feedbax/draft";
import { decodeImage, ImageError, imageFilesFrom } from "@/lib/feedbax/images";
import { CATEGORY_LABELS, LIMITS, type Category, type CreatePostResult } from "@/lib/feedbax/types";
import { AnnotationEditor } from "@/components/feedbax/annotation-editor";
import { Attachments, type AttachmentView } from "@/components/feedbax/attachments";
import {
  ConfirmBar,
  R,
  R_SM,
  RADIUS_VARS,
  Spinner,
  useHostRadius,
  useRoving,
} from "@/components/feedbax/parts";

export type FeedbaxDialogProps = {
  /** The portal's origin, e.g. "https://feedback.example.com". */
  portalUrl: string;
  /** Your server route that returns `{ token }` for the signed-in user. Default "/api/feedbax-token". */
  tokenUrl?: string;
  /** Overrides `tokenUrl` when you need custom auth for fetching the token. */
  getToken?: () => Promise<{ token: string }>;
  /** Your own trigger. Defaults to a "Feedback" button. Pass `null` to render no trigger and control the dialog with `open`. */
  trigger?: React.ReactNode;
  /** After a successful send, sign the user in to the portal and open their post. Default true. */
  redirectOnSubmit?: boolean;
  onSubmitted?: (result: CreatePostResult) => void;
  /** Optional controlled state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type Origin = AttachmentView["origin"];
type Attachment = {
  id: string;
  origin: Origin;
  bitmap: ImageBitmap;
  history: History;
  blob: Blob;
  previewUrl: string;
};
type Session = { id: string | null; history: History; initial: History; saving: boolean };
type Notice = { message: string; action?: { label: string; run: () => void } };

const CATEGORIES: ReadonlyArray<{ value: Category; Icon: typeof Bug; hint: string }> = [
  { value: "bug", Icon: Bug, hint: "Something isn't working" },
  { value: "feature", Icon: Lightbulb, hint: "An idea or improvement" },
  { value: "general", Icon: MessageSquare, hint: "Anything else" },
];

function disposeAttachment(a: Attachment) {
  a.bitmap.close();
  URL.revokeObjectURL(a.previewUrl);
}

async function makeAttachment(blob: Blob, origin: Origin): Promise<Attachment> {
  const bitmap = await decodeImage(blob);
  try {
    // Re-encode through a canvas right away: strips metadata and gives us the upload-ready bytes.
    const flat = await exportImage(bitmap, []);
    return {
      id: uuid(),
      origin,
      bitmap,
      history: emptyHistory,
      blob: flat,
      previewUrl: URL.createObjectURL(flat),
    };
  } catch (error) {
    bitmap.close();
    throw error;
  }
}

function Banner({
  message,
  tone = "error",
  children,
}: {
  message: string;
  tone?: "error" | "info";
  children?: React.ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 border px-3 py-2.5 text-xs",
        R_SM,
        tone === "error"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-muted text-foreground",
      )}
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <p className="flex-1 leading-relaxed">{message}</p>
      {children}
    </div>
  );
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="text-xs text-destructive">
      {children}
    </p>
  );
}

export function FeedbaxDialog(props: FeedbaxDialogProps) {
  const { portalUrl, tokenUrl, redirectOnSubmit = true, onSubmitted } = props;
  const getToken: GetToken = React.useMemo(
    () => props.getToken ?? createTokenGetter(tokenUrl),
    [props.getToken, tokenUrl],
  );

  /* ---- open state (controlled or not) ---- */
  const [innerOpen, setInnerOpen] = React.useState(false);
  const open = props.open ?? innerOpen;
  const setOpen = (next: boolean) => {
    props.onOpenChange?.(next);
    if (props.open === undefined) setInnerOpen(next);
  };
  const returnFocus = React.useRef<HTMLElement | null>(null);
  const resetTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- draft ---- */
  const [draft, dispatch] = React.useReducer(
    (
      state: ReturnType<typeof emptyDraft<Attachment>>,
      action: Parameters<typeof draftReducer<Attachment>>[1],
    ) => draftReducer<Attachment>(state, action),
    undefined,
    () => emptyDraft<Attachment>(uuid()),
  );
  const draftRef = React.useRef(draft);
  draftRef.current = draft;

  const [capturing, setCapturing] = React.useState(false);
  const [session, setSession] = React.useState<Session | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [canScreen, setCanScreen] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [confirm, setConfirm] = React.useState<null | "discard" | "discard-marks">(null);
  const [sending, setSending] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<ErrorView | null>(null);
  const [showErrors, setShowErrors] = React.useState(false);
  const [result, setResult] = React.useState<CreatePostResult | null>(null);
  const [redirecting, setRedirecting] = React.useState(false);
  const [redirectError, setRedirectError] = React.useState<string | null>(null);
  const busy = React.useRef(false);
  const dragDepth = React.useRef(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const uid = React.useId();

  React.useEffect(() => setCanScreen(screenCaptureSupported()), []);
  // Release bitmaps and object URLs if the host unmounts us.
  React.useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
      draftRef.current.attachments.forEach(disposeAttachment);
    },
    [],
  );

  /* ---- closing ---- */
  const resetEverything = () => {
    draftRef.current.attachments.forEach(disposeAttachment);
    dispatch({ type: "reset", id: uuid() });
    setSession(null);
    setNotice(null);
    setConfirm(null);
    setSubmitError(null);
    setShowErrors(false);
    setResult(null);
    setRedirecting(false);
    setRedirectError(null);
  };
  const close = () => {
    setOpen(false);
    setConfirm(null);
    // Wait for the exit animation, then release images, bitmaps and the draft.
    resetTimer.current = setTimeout(resetEverything, 250);
    requestAnimationFrame(() => returnFocus.current?.focus?.());
  };
  const openDialog = (trigger?: HTMLElement | null) => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    returnFocus.current = trigger ?? (document.activeElement as HTMLElement | null);
    setOpen(true);
  };

  const sessionChanged = (s: Session) =>
    s.history.ops.length !== s.initial.ops.length ||
    s.history.ops.some((op, i) => op !== s.initial.ops[i]);

  const handleOpenChange = (next: boolean) => {
    if (next || capturing) return;
    if (confirm) return setConfirm(null);
    if (sending || redirecting) return;
    if (session)
      return session.saving
        ? undefined
        : sessionChanged(session)
          ? setConfirm("discard-marks")
          : setSession(null);
    if (!result && hasContent(draftRef.current)) return setConfirm("discard");
    close();
  };

  /* ---- images ---- */
  const addFiles = async (files: File[], origin: Origin) => {
    if (files.length === 0 || busy.current) return;
    const room = LIMITS.images - draftRef.current.attachments.length;
    if (room <= 0) return setNotice({ message: `You can attach up to ${LIMITS.images} images.` });
    busy.current = true;
    setAdding(true);
    setNotice(null);
    const problems: string[] = [];
    try {
      for (const file of files.slice(0, room)) {
        try {
          dispatch({ type: "attach", attachment: await makeAttachment(file, origin) });
        } catch (error) {
          problems.push(
            error instanceof ImageError || error instanceof Error
              ? error.message
              : "That image could not be added.",
          );
        }
      }
      if (files.length > room)
        problems.push(`Only ${LIMITS.images} images fit, so the extras were skipped.`);
      if (problems.length > 0) setNotice({ message: problems[0] });
    } finally {
      busy.current = false;
      setAdding(false);
    }
  };

  const removeAttachment = (id: string) => {
    const found = draftRef.current.attachments.find((a) => a.id === id);
    if (found) disposeAttachment(found);
    dispatch({ type: "remove", id });
    setNotice(null);
  };

  const uploadPicker = () =>
    rootRef.current?.querySelector<HTMLInputElement>("input[type='file']")?.click();

  /** Screenshot of the page (default) or of the screen. The dialog hides itself first, then comes back. */
  const capture = async (kind: "viewport" | "screen", replaceId?: string) => {
    if (busy.current) return;
    busy.current = true;
    setNotice(null);
    let hidden = false;
    const hide = async () => {
      hidden = true;
      setCapturing(true);
      await waitUntilGone("[data-feedbax-dialog]");
    };
    let blob: Blob;
    try {
      if (kind === "viewport") {
        await hide();
        blob = await captureViewport();
      } else {
        blob = await captureScreen({ beforeFrame: hide });
      }
    } catch (error) {
      busy.current = false;
      if (hidden) setCapturing(false);
      if (!(error instanceof CaptureCancelledError))
        setNotice({
          message:
            "We couldn't capture the screen here. You can upload or paste a screenshot instead.",
          action: { label: "Upload an image", run: uploadPicker },
        });
      return;
    }
    // Bring the dialog back with the editor already open, showing a spinner while the image is prepared.
    setSession({ id: null, history: emptyHistory, initial: emptyHistory, saving: false });
    setCapturing(false);
    try {
      const attachment = await makeAttachment(blob, kind === "viewport" ? "screenshot" : "screen");
      const previous = replaceId
        ? draftRef.current.attachments.find((a) => a.id === replaceId)
        : undefined;
      if (previous) {
        disposeAttachment(previous);
        dispatch({ type: "replace", id: previous.id, attachment });
      } else {
        dispatch({ type: "attach", attachment });
      }
      setSession({
        id: attachment.id,
        history: emptyHistory,
        initial: emptyHistory,
        saving: false,
      });
    } catch (error) {
      setSession(null);
      setNotice({
        message: error instanceof Error ? error.message : "That image could not be added.",
        action: { label: "Upload an image", run: uploadPicker },
      });
    } finally {
      busy.current = false;
    }
  };

  const retake = (id: string) => {
    const found = draftRef.current.attachments.find((a) => a.id === id);
    if (!found) return;
    if (found.origin === "screenshot") void capture("viewport", id);
    else if (found.origin === "screen") void capture("screen", id);
    else {
      removeAttachment(id);
      uploadPicker();
    }
  };

  const annotate = (id: string) => {
    const found = draftRef.current.attachments.find((a) => a.id === id);
    if (found) setSession({ id, history: found.history, initial: found.history, saving: false });
  };

  const finishEditing = async () => {
    if (!session?.id) return;
    const found = draftRef.current.attachments.find((a) => a.id === session.id);
    if (!found) return setSession(null);
    setSession({ ...session, saving: true });
    try {
      const blob = await exportImage(found.bitmap, session.history.ops);
      const updated: Attachment = {
        ...found,
        history: session.history,
        blob,
        previewUrl: URL.createObjectURL(blob),
      };
      URL.revokeObjectURL(found.previewUrl);
      dispatch({ type: "update", id: found.id, attachment: updated });
      setSession(null);
    } catch (error) {
      setSession({ ...session, saving: false });
      setNotice({
        message: error instanceof Error ? error.message : "The image could not be saved.",
      });
    }
  };

  /* ---- submit ---- */
  const errors = {
    category: draft.category ? null : "Choose what kind of feedback this is.",
    title: draft.title.trim() ? null : "Add a short title.",
    body: draft.body.trim() ? null : "Describe what happened or what you'd like to see.",
  };
  const imageError = submitError?.field === "image";
  const hasErrors = Boolean(errors.category || errors.title || errors.body);

  const viewPost = async (target: CreatePostResult) => {
    setRedirecting(true);
    setRedirectError(null);
    try {
      const { token } = await getToken();
      window.location.assign(signInUrl({ portalUrl, token, to: `/posts/${target.postId}` }));
    } catch (error) {
      setRedirecting(false);
      setRedirectError(describeSubmitError(error).message);
    }
  };

  const submit = async () => {
    if (sending) return;
    setShowErrors(true);
    if (hasErrors) {
      (errors.category
        ? rootRef.current?.querySelector<HTMLElement>("[role='radio']")
        : errors.title
          ? titleRef.current
          : bodyRef.current
      )?.focus();
      return;
    }
    const current = draftRef.current;
    setSending(true);
    setSubmitError(null);
    try {
      const posted = await submitFeedback({
        portalUrl,
        getToken,
        id: current.id,
        title: current.title.trim(),
        body: current.body.trim(),
        category: current.category as Category,
        images: current.attachments.map((a) => a.blob),
      });
      setResult(posted);
      onSubmitted?.(posted);
      if (redirectOnSubmit) void viewPost(posted);
    } catch (error) {
      // The draft, its images and its post id all stay as they are, so a retry is safe.
      dispatch({ type: "failed" });
      setSubmitError(describeSubmitError(error));
    } finally {
      setSending(false);
    }
  };

  /* ---- paste, drag and drop ---- */
  const inForm = !session && !result;
  const hasFiles = (event: React.DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes("Files");
  const handlers = {
    onPaste: (event: React.ClipboardEvent) => {
      if (!inForm || sending) return;
      const files = imageFilesFrom(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      void addFiles(files, "paste");
    },
    onDragEnter: (event: React.DragEvent) => {
      if (!inForm || sending || !hasFiles(event)) return;
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (event: React.DragEvent) => {
      if (!inForm || sending || !hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (event: React.DragEvent) => {
      dragDepth.current = 0;
      setDragging(false);
      if (!inForm || sending || !hasFiles(event)) return;
      event.preventDefault();
      void addFiles(imageFilesFrom(event.dataTransfer), "drop");
    },
  };

  useHostRadius(rootRef);

  const categoryIndex = CATEGORIES.findIndex((c) => c.value === draft.category);
  const rovingCategory = useRoving(CATEGORIES.length, categoryIndex, (i) =>
    dispatch({ type: "category", value: CATEGORIES[i].value }),
  );

  /* ---- trigger ---- */
  type TriggerProps = { onClick?: (event: React.MouseEvent<HTMLElement>) => void };
  const custom = props.trigger;
  let trigger: React.ReactNode;
  if (custom === null) {
    trigger = null;
  } else if (React.isValidElement<TriggerProps>(custom)) {
    trigger = React.cloneElement(custom, {
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        custom.props.onClick?.(event);
        if (!event.defaultPrevented) openDialog(event.currentTarget);
      },
    });
  } else {
    trigger = (
      <Button type="button" onClick={(event) => openDialog(event.currentTarget)}>
        {custom === undefined ? (
          <>
            <MessageSquare aria-hidden data-icon="inline-start" /> Feedback
          </>
        ) : (
          custom
        )}
      </Button>
    );
  }

  const activeAttachment = session?.id
    ? draft.attachments.find((a) => a.id === session.id)
    : undefined;
  const views: AttachmentView[] = draft.attachments.map((a) => ({
    id: a.id,
    previewUrl: a.previewUrl,
    width: a.bitmap.width,
    height: a.bitmap.height,
    marks: a.history.ops.length,
    origin: a.origin,
  }));

  return (
    <>
      {trigger}
      <Dialog open={open && !capturing} onOpenChange={handleOpenChange}>
        <DialogContent
          data-feedbax-ignore=""
          data-feedbax-dialog=""
          className={cn(
            "top-0 left-0 h-dvh w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-none",
            "max-md:rounded-none max-md:ring-0",
            "md:top-1/2 md:left-1/2 md:h-auto md:w-[calc(100%-3rem)] md:max-w-5xl md:-translate-x-1/2 md:-translate-y-1/2",
          )}
        >
          <div
            ref={rootRef}
            style={RADIUS_VARS}
            {...handlers}
            className="relative flex h-dvh min-h-0 w-full flex-col overflow-hidden text-sm md:h-[min(46rem,calc(100dvh-3rem))]"
          >
            {result ? (
              /* ---------------- success ---------------- */
              <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
                <span className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check aria-hidden className="size-6" />
                </span>
                <div className="space-y-1.5">
                  <DialogTitle className="text-base">Thanks, your feedback is in</DialogTitle>
                  <DialogDescription className="mx-auto max-w-sm">
                    {redirecting
                      ? "Taking you to your post on the feedback portal…"
                      : "It's on the feedback portal now. You can follow it there."}
                  </DialogDescription>
                </div>
                {redirectError ? <Banner message={redirectError} /> : null}
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    type="button"
                    disabled={redirecting}
                    onClick={() => void viewPost(result)}
                    autoFocus
                  >
                    {redirecting ? (
                      <>
                        <Spinner /> Opening…
                      </>
                    ) : (
                      "View your post"
                    )}
                  </Button>
                  <Button type="button" variant="outline" onClick={close}>
                    Close
                  </Button>
                </div>
              </div>
            ) : session ? (
              /* ---------------- annotation editor ---------------- */
              <>
                <header className="border-b px-5 py-3.5 pr-14">
                  <DialogTitle>Annotate your screenshot</DialogTitle>
                  <DialogDescription>
                    Draw to show exactly what you mean. Hide anything private.
                  </DialogDescription>
                </header>
                {notice ? (
                  <div className="px-5 pt-3">
                    <Banner message={notice.message} />
                  </div>
                ) : null}
                <AnnotationEditor
                  source={activeAttachment?.bitmap ?? null}
                  history={session.history}
                  onHistoryChange={(history) => setSession((s) => (s ? { ...s, history } : s))}
                  saving={session.saving}
                  onCancel={() =>
                    sessionChanged(session) ? setConfirm("discard-marks") : setSession(null)
                  }
                  onDone={() => void finishEditing()}
                />
              </>
            ) : (
              /* ---------------- form ---------------- */
              <>
                <header className="border-b px-5 py-4 pr-14">
                  <DialogTitle className="text-base">Send feedback</DialogTitle>
                  <DialogDescription>
                    Tell us what's on your mind. A screenshot helps a lot.
                  </DialogDescription>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto md:grid md:grid-cols-2 md:overflow-hidden">
                  <fieldset
                    disabled={sending}
                    className="flex min-h-0 min-w-0 flex-col gap-5 p-5 md:overflow-y-auto"
                  >
                    <div className="space-y-2">
                      <span id={`${uid}-type`} className="text-xs font-medium">
                        What kind of feedback is this?
                      </span>
                      <div
                        role="radiogroup"
                        aria-labelledby={`${uid}-type`}
                        aria-describedby={
                          showErrors && errors.category ? `${uid}-type-error` : undefined
                        }
                        className="grid grid-cols-3 gap-2"
                      >
                        {CATEGORIES.map(({ value, Icon, hint }, index) => {
                          const selected = draft.category === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() => dispatch({ type: "category", value })}
                              {...rovingCategory(index)}
                              className={cn(
                                "flex flex-col items-start gap-1.5 border bg-background p-3 text-left transition-colors outline-none",
                                "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                                "disabled:pointer-events-none disabled:opacity-60",
                                R_SM,
                                selected && "border-primary bg-primary/5 ring-1 ring-primary",
                              )}
                            >
                              <Icon
                                aria-hidden
                                className={cn(
                                  "size-4",
                                  selected ? "text-primary" : "text-muted-foreground",
                                )}
                              />
                              <span className="text-xs font-medium">{CATEGORY_LABELS[value]}</span>
                              <span className="hidden text-[11px] leading-snug text-muted-foreground sm:block">
                                {hint}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {showErrors && errors.category ? (
                        <FieldError id={`${uid}-type-error`}>{errors.category}</FieldError>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between">
                        <Label htmlFor={`${uid}-title`}>Title</Label>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {draft.title.length}/{LIMITS.title}
                        </span>
                      </div>
                      <Input
                        ref={titleRef}
                        id={`${uid}-title`}
                        autoFocus
                        autoComplete="off"
                        maxLength={LIMITS.title}
                        placeholder="A short summary"
                        value={draft.title}
                        aria-invalid={
                          Boolean((showErrors && errors.title) || submitError?.field === "title") ||
                          undefined
                        }
                        aria-describedby={
                          showErrors && errors.title ? `${uid}-title-error` : undefined
                        }
                        onChange={(event) => dispatch({ type: "title", value: event.target.value })}
                        onKeyDown={(event) =>
                          (event.metaKey || event.ctrlKey) && event.key === "Enter" && void submit()
                        }
                      />
                      {showErrors && errors.title ? (
                        <FieldError id={`${uid}-title-error`}>{errors.title}</FieldError>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between">
                        <Label htmlFor={`${uid}-body`}>Description</Label>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {draft.body.length}/{LIMITS.body}
                        </span>
                      </div>
                      <Textarea
                        ref={bodyRef}
                        id={`${uid}-body`}
                        maxLength={LIMITS.body}
                        placeholder="What happened? What did you expect? Steps to reproduce help."
                        value={draft.body}
                        aria-invalid={
                          Boolean((showErrors && errors.body) || submitError?.field === "body") ||
                          undefined
                        }
                        aria-describedby={
                          showErrors && errors.body ? `${uid}-body-error` : undefined
                        }
                        className="max-h-80 min-h-40 resize-none"
                        onChange={(event) => dispatch({ type: "body", value: event.target.value })}
                        onKeyDown={(event) =>
                          (event.metaKey || event.ctrlKey) && event.key === "Enter" && void submit()
                        }
                      />
                      {showErrors && errors.body ? (
                        <FieldError id={`${uid}-body-error`}>{errors.body}</FieldError>
                      ) : null}
                    </div>
                  </fieldset>

                  <section
                    aria-label="Screenshot"
                    className="flex min-h-72 min-w-0 flex-col gap-3 border-t bg-muted/30 p-5 md:min-h-0 md:overflow-y-auto md:border-t-0 md:border-l"
                  >
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-xs font-medium">Screenshot</h3>
                      <span className="text-[11px] text-muted-foreground">
                        Optional · up to {LIMITS.images}
                      </span>
                    </div>
                    {notice ? (
                      <Banner message={notice.message}>
                        {notice.action ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={notice.action.run}
                          >
                            {notice.action.label}
                          </Button>
                        ) : null}
                      </Banner>
                    ) : null}
                    {imageError && submitError ? (
                      <Banner message="Remove or replace the image that was rejected, then send again." />
                    ) : null}
                    <Attachments
                      attachments={views}
                      busy={adding}
                      disabled={sending}
                      canCaptureScreen={canScreen}
                      onScreenshot={() => void capture("viewport")}
                      onScreen={() => void capture("screen")}
                      onFiles={(files) => void addFiles(files, "upload")}
                      onAnnotate={annotate}
                      onRetake={retake}
                      onRemove={removeAttachment}
                    />
                  </section>
                </div>

                <footer className="relative flex flex-col gap-3 border-t bg-background px-5 py-3">
                  {submitError && !submitError.field ? (
                    <Banner message={submitError.message}>
                      {submitError.retryable ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={sending}
                          onClick={() => void submit()}
                        >
                          Try again
                        </Button>
                      ) : null}
                    </Banner>
                  ) : null}
                  {submitError?.field && submitError.field !== "image" ? (
                    <Banner message={submitError.message} />
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <p className="max-w-md text-[11px] leading-snug text-muted-foreground">
                      Your title, description and images are public on the feedback portal. Nothing
                      else about this page is sent.
                    </p>
                    <div className="ml-auto flex items-center gap-2">
                      {sending ? (
                        <span role="status" className="text-xs text-muted-foreground">
                          {draft.attachments.length > 0
                            ? `Uploading ${draft.attachments.length} image${draft.attachments.length === 1 ? "" : "s"}…`
                            : "Sending…"}
                        </span>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        disabled={sending}
                        onClick={() => handleOpenChange(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="button" disabled={sending} onClick={() => void submit()}>
                        {sending ? (
                          <>
                            <Spinner /> Sending…
                          </>
                        ) : (
                          "Send feedback"
                        )}
                      </Button>
                    </div>
                  </div>
                  {sending ? (
                    <div
                      role="progressbar"
                      aria-label="Sending feedback"
                      className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-muted"
                    >
                      <div className="h-full w-full animate-pulse bg-primary" />
                    </div>
                  ) : null}
                </footer>
              </>
            )}

            {dragging ? (
              <div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-3 z-20 grid place-items-center border-2 border-dashed border-primary bg-background/85 text-sm font-medium",
                  R,
                )}
              >
                Drop an image to attach it
              </div>
            ) : null}

            {confirm === "discard" ? (
              <ConfirmBar
                title="Discard this feedback?"
                description="Your title, description and images haven't been sent yet. If you close now they are lost."
                confirmLabel="Discard"
                cancelLabel="Keep writing"
                destructive
                onCancel={() => setConfirm(null)}
                onConfirm={close}
              />
            ) : null}
            {confirm === "discard-marks" ? (
              <ConfirmBar
                title="Discard your changes?"
                description="The marks you just made on this image won't be saved."
                confirmLabel="Discard changes"
                destructive
                onCancel={() => setConfirm(null)}
                onConfirm={() => {
                  setConfirm(null);
                  setSession(null);
                }}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
