import { Label as LabelPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/ui/lib/cn';

export const Label = ({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) => (
  <LabelPrimitive.Root data-slot="label" className={cn('text-sm leading-none font-medium select-none', className)} {...props} />
);
