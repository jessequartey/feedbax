import { createFileRoute } from "@tanstack/react-router";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@feedbax/ui/components/empty";
export const Route = createFileRoute("/changelog")({ component: Changelog });
function Changelog() {
  return (
    <main className="feedback-index changelog-page">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Changelog is coming soon</EmptyTitle>
          <EmptyDescription>
            Product updates will have a home here. For now, follow the roadmap
            to see what is planned and shipping.
          </EmptyDescription>
        </EmptyHeader>
        <a href="/roadmap">View roadmap</a>
      </Empty>
    </main>
  );
}
