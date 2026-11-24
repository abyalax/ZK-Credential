import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/ui/lib/cn';

const badgeVariants = cva(
  'inline-flex w-fit items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
        accepted: 'border-transparent bg-accepted-soft text-accepted',
        rejected: 'border-transparent bg-rejected-soft text-rejected',
        running: 'border-transparent bg-running-soft text-running',
        pending: 'border-transparent bg-pending-soft text-pending',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export const Badge = ({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) => (
  <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
);
