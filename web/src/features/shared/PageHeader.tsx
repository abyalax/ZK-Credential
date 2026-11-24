import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-prose">
        <h1 className="text-3xl leading-tight font-semibold">{title}</h1>
        <p className="mt-1 text-muted-foreground">{description}</p>
      </div>
      {actions}
    </div>
  );
}
