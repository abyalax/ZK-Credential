import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Check, Copy, Send } from 'lucide-react';
import { useState } from 'react';
import { formatCountdown, formatGpa, formatMs, shorten } from '@/shared';
import { Button } from '@/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Label } from '@/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select';
import { useNow } from '../shared/hooks';
import {
  createProofAtom,
  openChallengesAtom,
  proofStateAtom,
  selectedChallengeAtom,
  sendPresentationAtom,
  thresholdAtom,
} from './model';

const THRESHOLDS = [200, 250, 300, 350, 375];

function ProofResult() {
  const state = useAtomValue(proofStateAtom);
  const send = useSetAtom(sendPresentationAtom);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  if (state.status !== 'done') return null;
  const { value } = state;
  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(value));
    setCopied(true);
  };
  return (
    <div className="grid gap-3 rounded-md border bg-secondary/50 p-3 text-sm">
      <p>
        Proof dibuat dalam <strong>{formatMs(value.durationMs)}</strong>. Ukuran {value.sizeBytes} byte, payload{' '}
        <code className="font-mono text-xs">{shorten(value.payload, 12, 6)}</code>.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            send();
            setSent(true);
          }}
        >
          {sent ? <Check /> : <Send />} {sent ? 'Terkirim ke verifier' : 'Kirim ke verifier'}
        </Button>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check /> : <Copy />} Salin presentasi
        </Button>
      </div>
    </div>
  );
}

export function ProofCard() {
  const challenges = useAtomValue(openChallengesAtom);
  const [challenge, selectChallenge] = useAtom(selectedChallengeAtom);
  const [threshold, setThreshold] = useAtom(thresholdAtom);
  const state = useAtomValue(proofStateAtom);
  const create = useSetAtom(createProofAtom);
  const now = useNow(250);
  const [startedAt, setStartedAt] = useState(0);
  const proving = state.status === 'loading';
  const active = challenges.find((item) => item.value === challenge);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Buat proof</CardTitle>
        <CardDescription>Bukti bahwa IPK memenuhi threshold, terikat ke satu challenge milik satu verifier.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-1.5">
          <Label>Challenge dari verifier</Label>
          <Select value={challenge} onValueChange={selectChallenge} disabled={challenges.length === 0}>
            <SelectTrigger aria-label="Challenge dari verifier">
              <SelectValue
                placeholder={challenges.length === 0 ? 'Belum ada challenge. Minta dari halaman Verifier.' : 'Pilih challenge'}
              />
            </SelectTrigger>
            <SelectContent>
              {challenges.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.verifierId} · {shorten(item.value, 8, 4)} · sisa {formatCountdown(item.expiresAt - now)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Threshold IPK</Label>
          <Select value={String(threshold)} onValueChange={(value) => setThreshold(Number(value))}>
            <SelectTrigger aria-label="Threshold IPK">
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
        <Button
          disabled={proving || !active}
          onClick={() => {
            setStartedAt(Date.now());
            create();
          }}
        >
          {proving ? `Membuat proof… ${formatMs(now - startedAt)}` : 'Buat proof'}
        </Button>
        {state.status === 'error' && <p className="text-sm text-rejected">{state.message}</p>}
        <ProofResult />
      </CardContent>
    </Card>
  );
}
