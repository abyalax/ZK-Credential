import { useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { usePolling } from '../shared/hooks';
import { PageHeader } from '../shared/PageHeader';
import { ChallengeCard } from './ChallengeCard';
import { refreshVerifierAtom } from './model';
import { PolicyCard, PresentationCard } from './PresentationCard';

export function VerifierPage() {
  const refresh = useSetAtom(refreshVerifierAtom);
  usePolling(useCallback(() => refresh(), [refresh]));
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Verifier"
        description="Pihak penerima menentukan kebijakan, menerbitkan challenge, dan memeriksa presentasi dari holder."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-6">
          <PolicyCard />
          <ChallengeCard />
        </div>
        <PresentationCard />
      </div>
    </div>
  );
}
