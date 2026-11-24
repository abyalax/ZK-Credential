import type * as React from 'react';
import { cn } from '@/ui/lib/cn';

export const Card = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    data-slot="card"
    className={cn('flex flex-col gap-4 rounded-lg border bg-card py-5 text-card-foreground', className)}
    {...props}
  />
);

export const CardHeader = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div data-slot="card-header" className={cn('grid gap-1 px-5', className)} {...props} />
);

export const CardTitle = ({ className, ...props }: React.ComponentProps<'h3'>) => (
  <h3 data-slot="card-title" className={cn('text-lg leading-tight font-semibold', className)} {...props} />
);

export const CardDescription = ({ className, ...props }: React.ComponentProps<'p'>) => (
  <p data-slot="card-description" className={cn('text-sm text-muted-foreground', className)} {...props} />
);

export const CardContent = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div data-slot="card-content" className={cn('px-5', className)} {...props} />
);

export const CardFooter = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div data-slot="card-footer" className={cn('flex items-center gap-2 px-5', className)} {...props} />
);
