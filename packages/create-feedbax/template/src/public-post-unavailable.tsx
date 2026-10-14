export function PublicPostUnavailable() {
  return (
    <main className="feedback-detail feedback-detail-missing">
      <p className="feedback-eyebrow">Post unavailable</p>
      <h1>This Post isn’t available.</h1>
      <p>It may not exist, or it may not be published yet.</p>
      <a href="/">Browse Posts</a>
    </main>
  );
}
