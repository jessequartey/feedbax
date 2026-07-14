import type { PropsWithChildren } from 'react'
import { cn } from '../../lib/utils.js'
export function StatusBadge({
  children,
  className,
}: PropsWithChildren<{ readonly className?: string }>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-medium',
        className,
      )}
    >
      {children}
    </span>
  )
}
