import { Button } from "@feedbax/ui/components/button";

export function PublicPortalError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="public-error">
      <p className="feedback-eyebrow">Temporary interruption</p>
      <h1>Posts are temporarily unavailable.</h1>
      <p>
        We couldn’t reach the Post service after several attempts. Your private
        information has not been displayed.
      </p>
      <div className="public-error-actions">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Button render={<a href="/" />} variant="outline">
          Return to the portal
        </Button>
      </div>
    </main>
  );
}
