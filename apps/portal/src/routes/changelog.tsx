import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@feedbax/ui/components/empty";
export const Route = createFileRoute("/changelog")({ component: Changelog });
export function Changelog() {
  return (
    <main className="feedback-index changelog-page">
      <Empty>
        <EmptyHeader>
          <EmptyTitle role="heading" aria-level={1}>
            Changelog is coming soon
          </EmptyTitle>
          <EmptyDescription>
            Product updates will have a home here. For now, follow the roadmap
            to see what is planned and shipping.
          </EmptyDescription>
        </EmptyHeader>
        <Link to="/roadmap">View roadmap</Link>
      </Empty>
    </main>
  );
}
