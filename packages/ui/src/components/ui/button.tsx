import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils.js'
export const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:opacity-90',
        outline: 'border border-border bg-background hover:bg-muted',
        ghost: 'hover:bg-muted',
      },
      size: { default: 'h-10 px-4 py-2', sm: 'h-9 px-3', lg: 'h-11 px-6' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)
export interface ButtonProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  readonly asChild?: boolean
}
export function Button({
  asChild,
  className,
  variant,
  size,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button'
  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
