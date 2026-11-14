import * as React from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { PublicConfig } from "@/contracts/config";
import { authClient } from "@/lib/auth-client";
import { hostOf } from "./format";
import { safeRelativePath } from "./safe-path";

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
export const NAME_MAX = 80;

type Mode = "login" | "signup";
type FieldErrors = Partial<Record<"name" | "email" | "password" | "form", string>>;

export function validateAuth(
  mode: Mode,
  values: { name: string; email: string; password: string },
): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === "signup") {
    const name = values.name.trim();
    if (!name) errors.name = "Enter your name.";
    else if (name.length > NAME_MAX) errors.name = `Use at most ${NAME_MAX} characters.`;
  }
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = "Enter a valid email address.";
  if (!values.password) errors.password = "Enter your password.";
  else if (mode === "signup" && values.password.length < PASSWORD_MIN)
    errors.password = `Use at least ${PASSWORD_MIN} characters.`;
  else if (values.password.length > PASSWORD_MAX)
    errors.password = `Use at most ${PASSWORD_MAX} characters.`;
  return errors;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="text-xs text-destructive">
      {message}
    </p>
  ) : null;
}

export function OAuthButtons({ oauth, to }: { oauth: PublicConfig["oauth"]; to: string }) {
  const providers = (
    [
      ["github", "GitHub"],
      ["google", "Google"],
    ] as const
  ).filter(([key]) => oauth[key]);
  const [pending, setPending] = React.useState<string | null>(null);
  if (providers.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {providers.map(([provider, label]) => (
        <Button
          key={provider}
          type="button"
          variant="outline"
          className="h-9 w-full max-md:h-11"
          disabled={pending !== null}
          onClick={async () => {
            setPending(provider);
            const result = await authClient.signIn.social({ provider, callbackURL: to });
            if (result?.error) {
              setPending(null);
              toast.error(result.error.message || `Couldn't continue with ${label}.`);
            }
          }}
        >
          {pending === provider ? (
            <Loader2Icon className="animate-spin" aria-hidden="true" />
          ) : null}
          Continue with {label}
        </Button>
      ))}
      <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
        <Separator className="flex-1" /> or <Separator className="flex-1" />
      </div>
    </div>
  );
}

export function AuthForm({
  mode,
  config,
  to: rawTo,
}: {
  mode: Mode;
  config: PublicConfig;
  to?: string;
}) {
  const router = useRouter();
  const ids = React.useId();
  const to = safeRelativePath(rawTo);
  const [values, setValues] = React.useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [pending, setPending] = React.useState(false);
  const signup = mode === "signup";
  const search = to === "/" ? {} : { to };

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const found = validateAuth(mode, values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setPending(true);
    try {
      const result = signup
        ? await authClient.signUp.email({
            name: values.name.trim(),
            email: values.email.trim(),
            password: values.password,
          })
        : await authClient.signIn.email({
            email: values.email.trim(),
            password: values.password,
          });
      if (result.error) {
        setErrors({
          form:
            result.error.message ||
            (signup ? "Couldn't create your account." : "Wrong email or password."),
        });
        return;
      }
      await router.invalidate();
      router.history.push(to);
    } catch {
      setErrors({ form: "Couldn't reach the server. Please try again." });
    } finally {
      setPending(false);
    }
  }

  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: event.target.value }));

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-xl">{signup ? "Create an account" : "Sign in"}</CardTitle>
        <CardDescription>
          {signup
            ? `Join ${config.name} to post, comment and vote.`
            : `Welcome back to ${config.name}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <OAuthButtons oauth={config.oauth} to={to} />
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {signup ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-name`}>Name</Label>
              <Input
                id={`${ids}-name`}
                name="name"
                autoComplete="name"
                maxLength={NAME_MAX}
                value={values.name}
                onChange={set("name")}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? `${ids}-name-error` : undefined}
                className="h-9 max-md:h-11 max-md:text-base"
              />
              <FieldError id={`${ids}-name-error`} message={errors.name} />
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-email`}>Email</Label>
            <Input
              id={`${ids}-email`}
              name="email"
              type="email"
              autoComplete="email"
              value={values.email}
              onChange={set("email")}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? `${ids}-email-error` : undefined}
              className="h-9 max-md:h-11 max-md:text-base"
            />
            <FieldError id={`${ids}-email-error`} message={errors.email} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-password`}>Password</Label>
            <Input
              id={`${ids}-password`}
              name="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              value={values.password}
              onChange={set("password")}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={`${ids}-password-hint${errors.password ? ` ${ids}-password-error` : ""}`}
              className="h-9 max-md:h-11 max-md:text-base"
            />
            {signup ? (
              <p id={`${ids}-password-hint`} className="text-xs text-muted-foreground">
                At least {PASSWORD_MIN} characters.
              </p>
            ) : (
              <span id={`${ids}-password-hint`} hidden />
            )}
            <FieldError id={`${ids}-password-error`} message={errors.password} />
          </div>
          <FieldError id={`${ids}-form-error`} message={errors.form} />
          <Button type="submit" disabled={pending} className="h-9 w-full max-md:h-11">
            {pending ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
            {signup ? "Create account" : "Sign in"}
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">
          {signup ? "Already have an account? " : "New here? "}
          <Link
            to={signup ? "/login" : "/signup"}
            search={search}
            className="text-foreground underline underline-offset-4"
          >
            {signup ? "Sign in" : "Create an account"}
          </Link>
        </p>
        {config.anonymous ? (
          <p className="text-center text-xs text-muted-foreground">
            You can also{" "}
            <Link to="/" className="text-foreground underline underline-offset-4">
              browse and post without an account
            </Link>
            .
          </p>
        ) : null}
        {config.appUrl ? (
          <p className="text-center text-xs text-muted-foreground">
            Came from {hostOf(config.appUrl)}?{" "}
            <a href={config.appUrl} className="text-foreground underline underline-offset-4">
              Go back
            </a>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
