import { queryOptions } from "@tanstack/react-query";
import type { ParticipantNotification } from "@feedbax/feedback";
export interface NotificationPage {
  items: ParticipantNotification[];
  unreadCount: number;
  nextCursor?: string;
}
export interface EmailPreferences {
  emailAvailable: boolean;
  emailEnabled: boolean;
}
export async function participationRequest<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/internal/connected/${path}`, {
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      value && typeof value === "object" && "error" in value
        ? String(value.error)
        : "Updates are temporarily unavailable.",
    );
  return value as T;
}
export const followQuery = (slug: string) =>
  queryOptions({
    queryKey: ["participant-follow", slug],
    queryFn: () =>
      participationRequest<{ following: boolean }>(
        `follow?slug=${encodeURIComponent(slug)}`,
      ),
    staleTime: 0,
    retry: false,
  });
export const preferencesQuery = () =>
  queryOptions({
    queryKey: ["participant-email-preferences"],
    queryFn: () => participationRequest<EmailPreferences>("preferences"),
    staleTime: 0,
    retry: false,
  });
export const notificationQuery = {
  queryKey: ["participant-notifications"],
  initialPageParam: undefined as string | undefined,
  queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
    participationRequest<NotificationPage>(
      `notifications${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`,
    ),
  getNextPageParam: (last: NotificationPage) => last.nextCursor,
  retry: false as const,
};
