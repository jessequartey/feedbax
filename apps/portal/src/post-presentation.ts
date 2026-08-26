import type { PostStatus, PostType } from "@feedbax/feedback";
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
  type LucideIcon,
} from "lucide-react";

export const postTypePresentation = {
  "Feature Request": {
    Icon: Lightbulb,
    boardLabel: "Feature requests",
  },
  "Bug Report": {
    Icon: Bug,
    boardLabel: "Bug reports",
  },
  "General Feedback": {
    Icon: MessageCircle,
    boardLabel: "General feedback",
  },
} satisfies Record<PostType, { Icon: LucideIcon; boardLabel: string }>;

export const postStatusPresentation = {
  New: { Icon: Circle, label: "New" },
  Reviewing: { Icon: Search, label: "Reviewing" },
  Planned: { Icon: CalendarDays, label: "Planned" },
  "In Progress": { Icon: CircleDot, label: "In progress" },
  Shipped: { Icon: CheckCircle2, label: "Shipped" },
  Closed: { Icon: XCircle, label: "Closed" },
} satisfies Record<PostStatus, { Icon: LucideIcon; label: string }>;
