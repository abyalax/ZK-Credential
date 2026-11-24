import type * as React from 'react';
import { cn } from '@/ui/lib/cn';

export const Input = ({ className, type, ...props }: React.ComponentProps<'input'>) => (
  <input
    type={type}
    data-slot="input"
    className={cn(
      'h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
      className,
    )}
    {...props}
  />
);
