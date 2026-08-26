import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Search } from "lucide-react";

import { Button } from "@feedbax/ui/components/button";
import { cn } from "@feedbax/ui/lib/utils";

const ignoreOpenChange = () => {};

const CommandPaletteContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(() => ({ open, setOpen }), [open]);
  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette() {
  const context = useContext(CommandPaletteContext);
  const setOpen = context?.setOpen ?? ignoreOpenChange;
  const openPalette = useCallback(() => setOpen(true), [setOpen]);
  return { open: context?.open ?? false, setOpen, openPalette };
}

export function CommandPaletteTrigger({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { openPalette } = useCommandPalette();
  return (
    <Button
      className={cn("h-10 gap-2 px-4 text-sm", className)}
      variant="outline"
      type="button"
      aria-haspopup="dialog"
      onClick={openPalette}
    >
      <Search aria-hidden="true" />
      <span className={compact ? "sr-only" : undefined}>Search</span>
    </Button>
  );
}
