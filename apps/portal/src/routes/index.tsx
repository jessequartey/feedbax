import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <section className="rounded-lg border p-6">
        <h1 className="mb-2 text-2xl font-semibold">Feedbax Core</h1>
        <p className="text-muted-foreground">
          The Notion-native feedback portal foundation is ready.
        </p>
      </section>
    </main>
  );
}
