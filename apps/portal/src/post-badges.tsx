import type { PostStatus, PostType } from "@feedbax/feedback";
import { Badge } from "@feedbax/ui/components/badge";

import {
  postStatusPresentation,
  postTypePresentation,
} from "./post-presentation";

export function PostTypeBadge({ type }: { type: PostType }) {
  const { Icon } = postTypePresentation[type];
  return (
    <Badge variant="outline">
      <Icon aria-hidden="true" />
      {type}
    </Badge>
  );
}

export function PostStatusBadge({ status }: { status: PostStatus }) {
  const { Icon } = postStatusPresentation[status];
  return (
    <Badge variant="outline" data-status={status}>
      <Icon aria-hidden="true" />
      {status}
    </Badge>
  );
}
