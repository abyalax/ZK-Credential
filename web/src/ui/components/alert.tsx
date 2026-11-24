import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/ui/lib/cn';

const alertVariants = cva(
  'relative grid w-full gap-0.5 rounded-lg border px-4 py-3 text-sm [&>svg]:absolute [&>svg]:top-3.5 [&>svg]:left-4 [&>svg]:size-4 [&>svg~*]:pl-7',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        accepted: 'border-accepted/30 bg-accepted-soft text-accepted',
        rejected: 'border-rejected/30 bg-rejected-soft text-rejected',
        pending: 'border-pending/30 bg-pending-soft text-pending',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export const Alert = ({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) => (
  <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
);

export const AlertTitle = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div data-slot="alert-title" className={cn('font-medium', className)} {...props} />
);

export const AlertDescription = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div data-slot="alert-description" className={cn('text-sm opacity-90', className)} {...props} />
);
