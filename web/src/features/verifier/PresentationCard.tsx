import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { CircleCheck, CircleX } from 'lucide-react';
import { explainReason } from '@/domain';
import { formatGpa, formatMs, shorten } from '@/shared';
import { Alert, AlertDescription, AlertTitle } from '@/ui/components/alert';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Label } from '@/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select';
import { Textarea } from '@/ui/components/textarea';
import { presentationInboxAtom } from '../shared/state';
import { pastedProofAtom, requiredThresholdAtom, resultAtom, VERIFIER_ID, verifyAtom } from './model';

const THRESHOLDS = [200, 250, 300, 350, 375];

export function PolicyCard() {
  const [threshold, setThreshold] = useAtom(requiredThresholdAtom);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Kebijakan</CardTitle>
        <CardDescription>Apa yang dituntut verifier, terlepas dari apa yang disodorkan holder.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Verifier</span>
          <span>{VERIFIER_ID}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Konfigurasi</span>
          <Badge variant="secondary">B4 (model yang diusulkan)</Badge>
        </div>
        <div className="grid gap-1.5">
          <Label>IPK minimum</Label>
          <Select value={String(threshold)} onValueChange={(value) => setThreshold(Number(value))}>
            <SelectTrigger aria-label="IPK minimum">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THRESHOLDS.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  IPK ≥ {formatGpa(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

export function PresentationCard() {
  const inbox = useAtomValue(presentationInboxAtom);
  const [pasted, setPasted] = useAtom(pastedProofAtom);
  const verify = useSetAtom(verifyAtom);
  const result = useAtomValue(resultAtom);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Presentasi dan hasil</CardTitle>
        <CardDescription>
          Presentasi dari holder di tab ini masuk otomatis. Dari tab lain, tempel JSON yang disalin holder.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {inbox ? (
          <p className="rounded-md border bg-secondary/50 px-3 py-2 text-sm">
            Presentasi diterima: IPK ≥ {formatGpa(inbox.publicSignals.gpaThreshold)}, challenge{' '}
            <code className="font-mono text-xs">{shorten(inbox.publicSignals.challenge, 8, 4)}</code>.
          </p>
        ) : (
          <Textarea
            aria-label="JSON presentasi"
            placeholder="Tempel JSON presentasi"
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
          />
        )}
        <Button disabled={result.status === 'loading'} onClick={() => verify()}>
          {result.status === 'loading' ? 'Memeriksa…' : 'Periksa presentasi'}
        </Button>
        {result.status === 'error' && <p className="text-sm text-rejected">{result.message}</p>}
        {result.status === 'done' && (
          <Alert variant={result.value.accepted ? 'accepted' : 'rejected'}>
            {result.value.accepted ? <CircleCheck /> : <CircleX />}
            <AlertTitle>{result.value.accepted ? 'Diterima' : `Ditolak: ${result.value.reason}`}</AlertTitle>
            <AlertDescription>
              {explainReason(result.value.reason)} Pemeriksaan {formatMs(result.value.durationMs)}.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
