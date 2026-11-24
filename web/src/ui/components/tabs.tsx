import { Tabs as TabsPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/ui/lib/cn';

export const Tabs = ({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) => (
  <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-3', className)} {...props} />
);

export const TabsList = ({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List
    data-slot="tabs-list"
    className={cn('inline-flex h-9 w-fit items-center rounded-lg bg-muted p-1', className)}
    {...props}
  />
);

export const TabsTrigger = ({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    data-slot="tabs-trigger"
    className={cn(
      'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors data-[state=active]:bg-card data-[state=active]:text-foreground',
      className,
    )}
    {...props}
  />
);

export const TabsContent = ({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content data-slot="tabs-content" className={cn('flex-1 outline-none', className)} {...props} />
);
