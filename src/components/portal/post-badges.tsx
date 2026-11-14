import {
  BugIcon,
  CalendarIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleIcon,
  LightbulbIcon,
  LoaderIcon,
  MessageCircleIcon,
  XCircleIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS, STATUS_LABELS, type Category, type Status } from "@/contracts/domain";

export const CATEGORY_ICONS = {
  feature: LightbulbIcon,
  bug: BugIcon,
  general: MessageCircleIcon,
} as const satisfies Record<Category, unknown>;

export const STATUS_ICONS = {
  open: CircleIcon,
  planned: CalendarIcon,
  in_progress: LoaderIcon,
  done: CheckCircle2Icon,
  closed: XCircleIcon,
} as const satisfies Record<Status, unknown>;

export { CircleDashedIcon };

// Status is read from its icon and label, not from a colour palette (spec §14).
export function CategoryBadge({ category }: { category: Category }) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <Badge variant="outline" className="h-6 gap-1.5 px-2 font-normal text-muted-foreground">
      <Icon aria-hidden="true" />
      {CATEGORY_LABELS[category]}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  const Icon = STATUS_ICONS[status];
  return (
    <Badge
      variant={status === "done" ? "secondary" : "outline"}
      className="h-6 gap-1.5 px-2 font-normal"
    >
      <Icon aria-hidden="true" />
      {STATUS_LABELS[status]}
    </Badge>
  );
}
