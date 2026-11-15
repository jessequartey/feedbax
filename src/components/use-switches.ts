import * as React from "react";
import { toast } from "sonner";
import { createSwitchWriter } from "@/lib/switch-writer";

/** Keep response snapshots out of switch state: only the setting being saved can change. */
export function useSwitches<K extends string>(
  initial: Record<K, boolean>,
  persist: (key: K, value: boolean) => Promise<void>,
) {
  const [state, setState] = React.useState({ values: initial, pending: new Set<K>() });
  const persistRef = React.useRef(persist);
  persistRef.current = persist;
  const [change] = React.useState(() =>
    createSwitchWriter(
      initial,
      (key, value) => persistRef.current(key, value),
      (values, pending) => setState({ values, pending: new Set(pending) }),
      () => toast.error("Couldn't save that. Please try again."),
    ),
  );
  return { ...state, change };
}
