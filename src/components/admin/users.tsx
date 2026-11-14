import * as React from "react";
import { BanIcon, ShieldCheckIcon, ShieldOffIcon, UndoIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AdminUser, UserFilter } from "@/contracts/admin";
import type { Page } from "@/contracts/domain";
import { SearchField } from "@/components/portal/filter-panel";
import { formatDate } from "@/components/portal/format";
import { PaginationBar } from "@/components/portal/pagination-bar";
import { EmptyState } from "@/components/portal/states";
import { adminSetAdminRole, adminSetBanned } from "@/server/functions";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin";

const FILTERS: { value: UserFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "admin", label: "Admins" },
  { value: "banned", label: "Banned" },
];
const KIND_LABEL = { account: "Account", host: "Host app", anonymous: "Anonymous" } as const;

type Change =
  | { kind: "ban"; user: AdminUser }
  | { kind: "unban"; user: AdminUser }
  | { kind: "grant"; user: AdminUser }
  | { kind: "revoke"; user: AdminUser };

function describe(change: Change) {
  const name = change.user.name;
  switch (change.kind) {
    case "ban":
      return {
        title: `Ban ${name}?`,
        body: `${name} will still be able to read the portal, but can no longer post, vote or comment. You can unban them at any time.`,
        label: "Ban user",
        destructive: true,
        done: `${name} was banned.`,
      };
    case "unban":
      return {
        title: `Unban ${name}?`,
        body: `${name} will be able to post, vote and comment again.`,
        label: "Unban user",
        destructive: false,
        done: `${name} was unbanned.`,
      };
    case "grant":
      return {
        title: `Make ${name} an admin?`,
        body: `${name} will be able to moderate posts, manage users and change settings.`,
        label: "Make admin",
        destructive: false,
        done: `${name} is now an admin.`,
      };
    case "revoke":
      return {
        title: `Remove admin access from ${name}?`,
        body: `${name} will keep their account but lose access to the admin area.`,
        label: "Remove admin",
        destructive: true,
        done: `${name} is no longer an admin.`,
      };
  }
}

function UserRow({ user, onChange }: { user: AdminUser; onChange: (change: Change) => void }) {
  return (
    <li className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:gap-5 md:p-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-medium break-words">{user.name}</span>
          {user.self ? (
            <Badge variant="outline" className="h-6 px-2 font-normal">
              You
            </Badge>
          ) : null}
          {user.builtIn ? (
            <Badge variant="outline" className="h-6 px-2 font-normal">
              Built-in
            </Badge>
          ) : null}
          {user.admin ? (
            <Badge variant="secondary" className="h-6 gap-1.5 px-2 font-normal">
              <ShieldCheckIcon aria-hidden="true" /> Admin
            </Badge>
          ) : null}
          {user.banned ? (
            <Badge variant="destructive" className="h-6 gap-1.5 px-2 font-normal">
              <BanIcon aria-hidden="true" /> Banned
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-xs break-all text-muted-foreground">
          {[user.email, user.builtIn ? "Signs in with `npx feedbax admin`" : KIND_LABEL[user.kind]]
            .filter(Boolean)
            .join(" · ")}{" "}
          · joined {formatDate(user.createdAt)}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {user.banned ? (
          <Button
            variant="outline"
            className="h-9 max-md:h-11"
            onClick={() => onChange({ kind: "unban", user })}
          >
            <UndoIcon aria-hidden="true" /> Unban
          </Button>
        ) : (
          <Button
            variant="outline"
            className="h-9 max-md:h-11"
            // Admins (including you and the built-in admin) cannot be banned: revoke first.
            disabled={user.admin}
            title={user.admin ? "Remove admin access before banning." : undefined}
            onClick={() => onChange({ kind: "ban", user })}
          >
            <BanIcon aria-hidden="true" /> Ban
          </Button>
        )}
        {user.admin ? (
          <Button
            variant="outline"
            className="h-9 max-md:h-11"
            disabled={user.self}
            title={user.self ? "You can't remove your own admin access." : undefined}
            onClick={() => onChange({ kind: "revoke", user })}
          >
            <ShieldOffIcon aria-hidden="true" /> Remove admin
          </Button>
        ) : user.kind !== "anonymous" ? (
          <Button
            variant="outline"
            className="h-9 max-md:h-11"
            onClick={() => onChange({ kind: "grant", user })}
          >
            <ShieldCheckIcon aria-hidden="true" /> Make admin
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function UserManagement({
  page,
  q,
  filter,
  onQuery,
  onFilter,
  onPage,
}: {
  page: Page<AdminUser>;
  q: string | undefined;
  filter: UserFilter;
  onQuery: (q: string | undefined) => void;
  onFilter: (filter: UserFilter) => void;
  onPage: (page: number) => void;
}) {
  const act = useAdminAction();
  const [change, setChange] = React.useState<Change | null>(null);
  const last = React.useRef<Change | null>(null);
  if (change) last.current = change;
  const shown = change ?? last.current;
  const text = shown ? describe(shown) : null;
  return (
    <>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SearchField value={q} onCommit={onQuery} label="Search users" className="w-full md:w-80" />
        <ToggleGroup
          aria-label="Filter users"
          variant="outline"
          spacing={0}
          value={[filter]}
          onValueChange={(next) => {
            const chosen = next[0] as UserFilter | undefined;
            if (chosen) onFilter(chosen);
          }}
          className="w-full md:w-fit"
        >
          {FILTERS.map((item) => (
            <ToggleGroupItem
              key={item.value}
              value={item.value}
              className="h-9 flex-1 px-4 max-md:h-11 md:flex-none"
            >
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {page.items.length === 0 ? (
        <div className="border">
          <EmptyState
            title="No users found"
            description={q ? `Nobody matches “${q}”.` : "People appear here once they sign in."}
          />
        </div>
      ) : (
        <ul className="divide-y border" aria-label="Users">
          {page.items.map((user) => (
            <UserRow key={user.id} user={user} onChange={setChange} />
          ))}
        </ul>
      )}
      <PaginationBar page={page} onPage={onPage} />
      <ConfirmDialog
        open={change !== null}
        onOpenChange={(open) => (open ? undefined : setChange(null))}
        title={text?.title ?? ""}
        description={text?.body}
        confirmLabel={text?.label ?? "Confirm"}
        destructive={text?.destructive}
        onConfirm={async () => {
          if (!shown || !text) return false;
          const { kind, user } = shown;
          const done = await act<unknown>(
            () =>
              kind === "ban" || kind === "unban"
                ? adminSetBanned({ data: { userId: user.id, banned: kind === "ban" } })
                : adminSetAdminRole({ data: { userId: user.id, admin: kind === "grant" } }),
            text.done,
          );
          return done !== null;
        }}
      />
    </>
  );
}
