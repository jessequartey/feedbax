import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { Button } from "@feedbax/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@feedbax/ui/components/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@feedbax/ui/components/field";
import { Input } from "@feedbax/ui/components/input";
import { Mail } from "lucide-react";
import { Brand } from "../components/brand";
import { signInSchema } from "../sign-in-schema";

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: typeof search.returnTo === "string" ? search.returnTo : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in · Feedbax" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: SignInPage,
});

function SignInPage() {
  const search = Route.useSearch();
  const [returnTo, setReturnTo] = useState(search.returnTo ?? "/docs");
  const [token, setToken] = useState<string>();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState<string>();
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const pending = fragment.get("token");
    if (pending) {
      setToken(pending);
      setReturnTo(fragment.get("returnTo") ?? "/docs");
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
    }
    const controller = new AbortController();
    void fetch("/api/docs/session", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        if (data.user?.name) setName(data.user.name);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const form = useForm({
    defaultValues: { name: "", email: "" },
    validators: { onSubmit: signInSchema },
    onSubmit: async ({ value }) => {
      setError("");
      try {
        const response = await fetch("/api/auth/sign-in/magic-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...value, callbackURL: returnTo }),
        });
        if (!response.ok) throw new Error();
        setSent(true);
      } catch {
        setError("We couldn’t send your sign-in link. Please try again.");
      }
    },
  });
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/docs/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, returnTo }),
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      window.location.assign(data.redirectTo);
    } catch {
      setToken(undefined);
      setError("That sign-in link is invalid or expired. Request a new link.");
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error();
      setName(undefined);
    } catch {
      setError("Sign-out failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-8 px-5 py-12">
      <Brand />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {token
              ? "Confirm your sign-in"
              : name
                ? `Welcome, ${name}`
                : sent
                  ? "Check your email"
                  : "Sign in to Feedbax"}
          </CardTitle>
          <CardDescription className="text-sm">
            {token
              ? "Continue to sign in securely and return to your feedback."
              : name
                ? "You’re signed in with your Feedbax Docs identity."
                : sent
                  ? "Open the link we sent you. It expires in five minutes."
                  : "Use your email to vote, comment, and follow updates."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {token ? (
            <Button
              className="w-full"
              disabled={busy}
              onClick={() => void confirm()}
            >
              {busy ? "Signing in…" : "Confirm sign-in"}
            </Button>
          ) : name ? (
            <div className="flex flex-col gap-2">
              <Button
                nativeButton={false}
                render={<a href={safeReturnTo(returnTo)} />}
              >
                Continue
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void signOut()}
              >
                Sign out
              </Button>
            </div>
          ) : sent ? (
            <>
              <Mail
                aria-hidden="true"
                className="size-5 text-muted-foreground"
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setSent(false)}
              >
                Use another email
              </Button>
            </>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void form.handleSubmit();
              }}
            >
              <FieldGroup>
                <form.Field name="name">
                  {(field) => (
                    <Field
                      data-invalid={
                        field.state.meta.isTouched && !field.state.meta.isValid
                      }
                    >
                      <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        autoComplete="name"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        aria-invalid={
                          field.state.meta.isTouched &&
                          !field.state.meta.isValid
                        }
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>
                <form.Field name="email">
                  {(field) => (
                    <Field
                      data-invalid={
                        field.state.meta.isTouched && !field.state.meta.isValid
                      }
                    >
                      <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="email"
                        autoComplete="email"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        aria-invalid={
                          field.state.meta.isTouched &&
                          !field.state.meta.isValid
                        }
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(pending) => (
                    <Button type="submit" disabled={pending}>
                      {pending ? "Sending link…" : "Send sign-in link"}
                    </Button>
                  )}
                </form.Subscribe>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        <a href="/docs" className="underline underline-offset-4">
          Back to documentation
        </a>
      </p>
    </main>
  );
}

function safeReturnTo(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin &&
      (url.pathname === "/feedbax-login" || url.pathname === "/docs")
      ? url.pathname + url.search
      : "/docs";
  } catch {
    return "/docs";
  }
}
