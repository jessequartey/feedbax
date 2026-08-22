import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { PortalFeedbackForm } from "./portal-feedback-form";

export function RoutedPostCreationForm({
  display = "page",
  onCancel,
}: {
  display?: "page" | "overlay";
  onCancel?: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (
    <PortalFeedbackForm
      display={display}
      onCancel={onCancel}
      onCreated={async (slug) => {
        await queryClient.invalidateQueries({ queryKey: ["public-posts"] });
        await navigate({ to: "/p/$slug", params: { slug } });
      }}
    />
  );
}
