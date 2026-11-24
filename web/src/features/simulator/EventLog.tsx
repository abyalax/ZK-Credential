import { useAtomValue } from 'jotai';
import { formatMs } from '@/shared';
import { Badge } from '@/ui/components/badge';
import { playbackAtom } from './model';
import { NODE_LABEL, stepLabel } from './step-labels';

const STATUS_BADGE = { started: 'running', completed: 'accepted', rejected: 'rejected' } as const;
const STATUS_LABEL = { started: 'Mulai', completed: 'Selesai', rejected: 'Ditolak' } as const;

export function EventLog() {
  const { applied, pending } = useAtomValue(playbackAtom);
  if (applied.length === 0)
    return <p className="text-sm text-muted-foreground">Pilih konfigurasi dan skenario, lalu tekan Jalankan.</p>;
  return (
    <div>
      <ol className="divide-y text-sm" aria-live="polite">
        {applied.map((event) => (
          <li key={event.seq} className="flex items-start justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="font-medium">{stepLabel(event.step)}</span>
              <span className="block text-xs text-muted-foreground">
                {NODE_LABEL[event.node]}
                {event.durationMs !== undefined && ` · ${formatMs(event.durationMs)}`}
                {event.reason && ` · ${event.reason}`}
              </span>
            </span>
            <Badge variant={STATUS_BADGE[event.status]}>{STATUS_LABEL[event.status]}</Badge>
          </li>
        ))}
      </ol>
      {pending.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{pending.length} langkah menunggu.</p>}
    </div>
  );
}
