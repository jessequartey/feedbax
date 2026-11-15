import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminSetPostPriority } from "@/server/functions";
import { useAdminAction } from "./use-admin";

export default function PriorityEditor({
  postId,
  priority,
}: {
  postId: string;
  priority: number | null;
}) {
  const id = React.useId();
  const [value, setValue] = React.useState(priority === null ? "" : String(priority));
  const [pending, setPending] = React.useState(false);
  const act = useAdminAction();
  const score = value === "" ? null : Number(value);
  const valid = score === null || (Number.isInteger(score) && score >= 0 && score <= 100);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending || !valid) return;
        setPending(true);
        try {
          await act(
            () => adminSetPostPriority({ data: { postId, priority: score } }),
            score === null ? "Priority cleared." : "Priority saved.",
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={id}>Priority</Label>
        <Input
          id={id}
          type="number"
          min={0}
          max={100}
          step={1}
          placeholder="Unset"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={pending}
          aria-describedby={`${id}-hint`}
          aria-invalid={!valid}
          className="h-9 w-24 max-md:h-11"
        />
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={pending || !valid || score === priority}
        className="h-9 max-md:h-11"
      >
        {pending ? "Saving…" : "Save"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={pending || (priority === null && value === "")}
        className="h-9 max-md:h-11"
        onClick={() => setValue("")}
      >
        Clear
      </Button>
      <p id={`${id}-hint`} className="w-full text-xs text-muted-foreground">
        0–100 · Admins only. Clear, then save to remove.
      </p>
    </form>
  );
}
