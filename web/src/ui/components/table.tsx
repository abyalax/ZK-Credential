import type * as React from 'react';
import { cn } from '@/ui/lib/cn';

export const Table = ({ className, ...props }: React.ComponentProps<'table'>) => (
  <div className="relative w-full overflow-x-auto">
    <table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} />
  </div>
);
export const TableHeader = (props: React.ComponentProps<'thead'>) => (
  <thead data-slot="table-header" className="[&_tr]:border-b" {...props} />
);
export const TableBody = (props: React.ComponentProps<'tbody'>) => (
  <tbody data-slot="table-body" className="[&_tr:last-child]:border-0" {...props} />
);
export const TableRow = ({ className, ...props }: React.ComponentProps<'tr'>) => (
  <tr data-slot="table-row" className={cn('border-b', className)} {...props} />
);
export const TableHead = ({ className, ...props }: React.ComponentProps<'th'>) => (
  <th
    data-slot="table-head"
    className={cn('h-9 px-2 text-left align-middle font-medium whitespace-nowrap text-muted-foreground', className)}
    {...props}
  />
);
export const TableCell = ({ className, ...props }: React.ComponentProps<'td'>) => (
  <td data-slot="table-cell" className={cn('p-2 align-middle', className)} {...props} />
);
