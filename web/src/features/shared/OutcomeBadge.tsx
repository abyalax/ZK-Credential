import { CircleCheck, CircleX } from 'lucide-react';
import { Badge } from '@/ui/components/badge';

export function OutcomeBadge({ accepted, label }: { readonly accepted: boolean; readonly label?: string }) {
  return (
    <Badge variant={accepted ? 'accepted' : 'rejected'}>
      {accepted ? <CircleCheck className="size-3.5" /> : <CircleX className="size-3.5" />}
      {label ?? (accepted ? 'Diterima' : 'Ditolak')}
    </Badge>
  );
}
