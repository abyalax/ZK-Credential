import type * as React from 'react';
import { cn } from '@/ui/lib/cn';

export const Textarea = ({ className, ...props }: React.ComponentProps<'textarea'>) => (
  <textarea
    data-slot="textarea"
    className={cn(
      'flex min-h-20 w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
);
