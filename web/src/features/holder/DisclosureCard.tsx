import { useAtomValue } from 'jotai';
import { formatGpa, shorten } from '@/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { RedactedCredential } from '../shared/RedactedCredential';
import { openChallengesAtom, selectedChallengeAtom, selectedCredentialIdAtom, thresholdAtom, walletAtom } from './model';

/** The "opened vs hidden" panel: the verifier learns the threshold claim and four public values, nothing else. */
export function DisclosureCard() {
  const wallet = useAtomValue(walletAtom);
  const selectedCredentialId = useAtomValue(selectedCredentialIdAtom);
  const challenges = useAtomValue(openChallengesAtom);
  const selectedChallenge = useAtomValue(selectedChallengeAtom);
  const threshold = useAtomValue(thresholdAtom);
  const credential = wallet.find((item) => item.id === selectedCredentialId);
  const challenge = challenges.find((item) => item.value === selectedChallenge);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Yang dilihat verifier</CardTitle>
        <CardDescription>Blok hitam adalah nilai yang tidak pernah meninggalkan holder.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="rounded-md border border-accepted/30 bg-accepted-soft px-3 py-2 font-serif text-lg text-accepted">
          IPK pemegang kredensial ≥ {formatGpa(threshold)}
        </p>
        {credential ? (
          <RedactedCredential credential={credential} revealed={[]} />
        ) : (
          <p className="text-sm text-muted-foreground">Pilih kredensial di wallet untuk melihat apa yang disembunyikan.</p>
        )}
        <dl className="grid gap-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Verifier</dt>
            <dd>{challenge?.verifierId ?? '-'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Challenge</dt>
            <dd className="font-mono text-xs">{challenge ? shorten(challenge.value, 10, 6) : '-'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Issuer</dt>
            <dd>{credential?.issuerId ?? '-'}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
