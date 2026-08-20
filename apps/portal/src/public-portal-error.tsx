export function PublicPortalError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="public-error">
      <p className="feedback-eyebrow">Temporary interruption</p>
      <h1>Feedback is temporarily unavailable.</h1>
      <p>
        We couldn’t reach the feedback service after several attempts. Your
        private information has not been displayed.
      </p>
      <div className="public-error-actions">
        <button type="button" onClick={reset}>
          Try again
        </button>
        <a href="/">Return to the portal</a>
      </div>
    </main>
  );
}
