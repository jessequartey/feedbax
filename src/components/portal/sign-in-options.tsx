import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { PublicConfig } from "@/contracts/config";
import { authClient } from "@/lib/auth-client";
import { hostOf } from "./format";
import { safeRelativePath } from "./safe-path";

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
    </div>
  );
}

export function SignInOptions({ config, to: rawTo }: { config: PublicConfig; to?: string }) {
  const to = safeRelativePath(rawTo);
  const social = config.oauth.github || config.oauth.google;
  const host = config.hostLogin && config.appUrl;
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
        <CardDescription>Join {config.name} to post, comment and vote.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <OAuthButtons oauth={config.oauth} to={to} />
        {social && (host || config.anonymous) ? <Separator /> : null}
        {host ? (
          <div className="flex flex-col gap-2">
            <Button render={<a href={host} />} variant="outline">
              Continue in {hostOf(host)}
            </Button>
            <p className="text-xs text-muted-foreground">
              Open feedback from your app to sign in here.
            </p>
          </div>
        ) : null}
        {host && config.anonymous ? <Separator /> : null}
        {config.anonymous ? (
          <a href={to} className="text-center text-xs underline underline-offset-4">
            Browse and post without an account
          </a>
        ) : null}
        {!social && !host && !config.anonymous ? (
          <p className="text-sm text-muted-foreground">
            Sign-in isn't configured. You can browse feedback; the portal owner needs to finish
            setup.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
