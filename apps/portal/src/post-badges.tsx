import type { PostStatus, PostType } from "@feedbax/feedback";
import { Badge } from "@feedbax/ui/components/badge";
import {
  Bug,
  CalendarDays,
  CheckCircle2,
  Circle,
  CircleDot,
  Lightbulb,
  MessageCircle,
  Search,
  XCircle,
} from "lucide-react";

const typeIcons = {
  "Feature Request": Lightbulb,
  "Bug Report": Bug,
  "General Feedback": MessageCircle,
} satisfies Record<PostType, typeof Lightbulb>;

const statusIcons = {
  New: Circle,
  Reviewing: Search,
  Planned: CalendarDays,
  "In Progress": CircleDot,
  Shipped: CheckCircle2,
  Closed: XCircle,
} satisfies Record<PostStatus, typeof Circle>;

export function PostTypeBadge({ type }: { type: PostType }) {
  const Icon = typeIcons[type];
  return (
    <Badge variant="outline">
      <Icon aria-hidden="true" />
      {type}
    </Badge>
  );
}

export function PostStatusBadge({ status }: { status: PostStatus }) {
  const Icon = statusIcons[status];
  return (
    <Badge variant="outline" data-status={status}>
      <Icon aria-hidden="true" />
      {status}
    </Badge>
  );
}
