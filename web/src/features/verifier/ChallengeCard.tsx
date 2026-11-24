import { useAtomValue, useSetAtom } from 'jotai';
import type { ChallengeStatus } from '@/domain';
import { formatCountdown, shorten } from '@/shared';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { useNow } from '../shared/hooks';
import { CHALLENGE_TTL_MS, challengesAtom, issueChallengeAtom } from './model';

const STATUS: Record<ChallengeStatus, { label: string; variant: 'running' | 'accepted' | 'pending' }> = {
  issued: { label: 'Dibuat', variant: 'running' },
  consumed: { label: 'Dikonsumsi', variant: 'accepted' },
  expired: { label: 'Kedaluwarsa', variant: 'pending' },
};

export function ChallengeCard() {
  const challenges = useAtomValue(challengesAtom);
  const issue = useSetAtom(issueChallengeAtom);
  const now = useNow();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Challenge</CardTitle>
        <CardDescription>
          Nonce sekali pakai milik verifier ini, berlaku {CHALLENGE_TTL_MS / 60000} menit. Dikonsumsi hanya setelah proof
          terverifikasi.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Button onClick={() => issue()}>Buat challenge</Button>
        {challenges.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada challenge.</p>
        ) : (
          <ul className="divide-y text-sm">
            {challenges.map((challenge) => {
              const expired = challenge.status === 'issued' && challenge.expiresAt <= now;
              const status = STATUS[expired ? 'expired' : challenge.status];
              return (
                <li key={challenge.value} className="flex items-center justify-between gap-3 py-2">
                  <code className="font-mono text-xs">{shorten(challenge.value, 10, 6)}</code>
                  <span className="flex items-center gap-2">
                    {challenge.status === 'issued' && !expired && (
                      <span className="tabular-nums text-muted-foreground">{formatCountdown(challenge.expiresAt - now)}</span>
                    )}
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
