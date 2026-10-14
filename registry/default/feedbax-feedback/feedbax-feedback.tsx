"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type FeedbackFormValues = {
  title: string;
  description: string;
  type: "Feature Request" | "Bug Report" | "General Feedback";
  submitter?: { name?: string; email?: string };
};
export type SubmissionResult = { slug: string; title: string };
export type PostSuggestion = { slug: string; title: string; url?: string };

export function FeedbaxFeedback({
  onSubmit,
  findSimilar,
  trigger = "Send feedback",
  disabled = false,
}: {
  onSubmit(values: FeedbackFormValues): Promise<SubmissionResult>;
  findSimilar?(title: string): Promise<PostSuggestion[]>;
  trigger?: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const mobile = useMediaQuery("(max-width: 767px)");
  const triggerButton = <Button disabled={disabled}>{trigger}</Button>;
  const content = (
    <FeedbackForm
      onSubmit={onSubmit}
      findSimilar={findSimilar}
      onSuccess={() => setOpen(false)}
    />
  );

  return mobile ? (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger render={triggerButton} />
      <DrawerContent className="max-h-[92dvh] overflow-y-auto p-4">
        <DrawerHeader className="px-0">
          <DrawerTitle>Send feedback</DrawerTitle>
          <DrawerDescription>
            Tell us what would make the product work better for you.
          </DrawerDescription>
        </DrawerHeader>
        {content}
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={triggerButton} />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Tell us what would make the product work better for you.
          </DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

function FeedbackForm({
  onSubmit,
  findSimilar,
  onSuccess,
}: {
  onSubmit(values: FeedbackFormValues): Promise<SubmissionResult>;
  findSimilar?: (title: string) => Promise<PostSuggestion[]>;
  onSuccess(): void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [title, setTitle] = useState("");
  const [suggestions, setSuggestions] = useState<PostSuggestion[]>([]);
  const sequence = useRef(0);

  useEffect(() => {
    const query = title.trim();
    const current = ++sequence.current;
    if (!findSimilar || query.length < 4) {
      setSuggestions([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      void findSimilar(query)
        .then((items) => {
          if (current === sequence.current) setSuggestions(items.slice(0, 3));
        })
        .catch(() => {
          if (current === sequence.current) setSuggestions([]);
        });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [findSimilar, title]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSuccess(undefined);
    const form = event.currentTarget;
    const data = new FormData(form);
    const values: FeedbackFormValues = {
      title: String(data.get("title") ?? "").trim(),
      description: String(data.get("description") ?? "").trim(),
      type: String(data.get("type")) as FeedbackFormValues["type"],
      submitter: {
        name: String(data.get("name") ?? "").trim() || undefined,
        email: String(data.get("email") ?? "").trim() || undefined,
      },
    };
    if (!values.title || !values.description) {
      setError("Add a title and description.");
      return;
    }
    setPending(true);
    try {
      const result = await onSubmit(values);
      setSuccess(`Feedback sent: ${result.title}`);
      form.reset();
      setTitle("");
      window.setTimeout(onSuccess, 900);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Feedback could not be sent. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="feedbax-title">Title</FieldLabel>
          <Input
            id="feedbax-title"
            name="title"
            required
            maxLength={160}
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            autoFocus
          />
          {suggestions.length ? (
            <div
              aria-label="Potentially related Posts"
              className="border-l-2 pl-3 text-sm"
            >
              <p className="font-medium">Potentially related</p>
              <ul className="mt-1 space-y-1">
                {suggestions.map((item) => (
                  <li key={item.slug}>
                    {item.url ? (
                      <a
                        className="underline underline-offset-4"
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {item.title}
                      </a>
                    ) : (
                      item.title
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="feedbax-description">Description</FieldLabel>
          <Textarea
            id="feedbax-description"
            name="description"
            required
            maxLength={5000}
            rows={6}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="feedbax-type">Type</FieldLabel>
          <Select name="type" defaultValue="Feature Request">
            <SelectTrigger id="feedbax-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Feature Request">Feature Request</SelectItem>
              <SelectItem value="Bug Report">Bug Report</SelectItem>
              <SelectItem value="General Feedback">General Feedback</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="feedbax-name">Name (optional)</FieldLabel>
            <Input id="feedbax-name" name="name" maxLength={200} />
          </Field>
          <Field>
            <FieldLabel htmlFor="feedbax-email">Email (optional)</FieldLabel>
            <Input
              id="feedbax-email"
              name="email"
              type="email"
              maxLength={320}
            />
          </Field>
        </div>
      </FieldGroup>
      {error ? <FieldError role="alert">{error}</FieldError> : null}
      {success ? (
        <p role="status" className="text-sm text-emerald-700">
          {success}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Sending…" : "Send feedback"}
      </Button>
    </form>
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}
