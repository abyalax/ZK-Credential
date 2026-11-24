import { Switch as SwitchPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/ui/lib/cn';

export const Switch = ({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) => (
  <SwitchPrimitive.Root
    data-slot="switch"
    className={cn(
      'inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-input transition-colors data-[state=checked]:bg-primary disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-card transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5" />
  </SwitchPrimitive.Root>
);
