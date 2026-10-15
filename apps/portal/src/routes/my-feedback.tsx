import { createFileRoute, notFound } from "@tanstack/react-router";
import feedbax from "../feedbax";
import { MyFeedbackPage } from "../my-feedback-page";
export const Route = createFileRoute("/my-feedback")({
  beforeLoad: () => {
    if (!feedbax.connected) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "My feedback" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: MyFeedbackPage,
});
