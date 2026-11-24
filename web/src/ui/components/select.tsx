import { Check, ChevronDown } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/ui/lib/cn';

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = ({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Trigger>) => (
  <SelectPrimitive.Trigger
    data-slot="select-trigger"
    className={cn(
      'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="size-4 opacity-60" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
);

export const SelectContent = ({
  className,
  children,
  position = 'popper',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      data-slot="select-content"
      position={position}
      className={cn(
        'relative z-50 max-h-80 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md',
        position === 'popper' && 'w-[var(--radix-select-trigger-width)] translate-y-1',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
);

export const SelectLabel = ({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) => (
  <SelectPrimitive.Label className={cn('px-2 py-1.5 text-xs font-semibold text-muted-foreground', className)} {...props} />
);

export const SelectItem = ({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) => (
  <SelectPrimitive.Item
    data-slot="select-item"
    className={cn(
      'relative flex w-full cursor-default items-center rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent',
      className,
    )}
    {...props}
  >
    <span className="absolute right-2 flex size-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
);
