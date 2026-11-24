import { useAtomValue } from 'jotai';
import { Check, X } from 'lucide-react';
import { CREDENTIAL_ATTRIBUTES, findConfiguration, knowledgeFor } from '@/domain';
import { RedactedCredential } from '../shared/RedactedCredential';
import { configurationAtom } from './model';
import { SAMPLE_CREDENTIAL } from './sample';

const GUARANTEES = [
  ['issuerAuthenticity', 'Keaslian issuer'],
  ['holderBinding', 'Terikat ke holder'],
  ['replayProtection', 'Tahan replay'],
] as const;

/** What the verifier learns under the selected configuration: A = 8 attributes, SD = exact GPA, B1-B4 = none. */
export function KnowledgePanel() {
  const configuration = useAtomValue(configurationAtom);
  const { guarantees, label } = findConfiguration(configuration);
  const { revealed } = knowledgeFor(configuration);
  return (
    <div className="grid gap-4">
      <p className="text-sm">
        <span className="font-serif text-2xl font-semibold">{revealed.length}</span> dari {CREDENTIAL_ATTRIBUTES.length} atribut
        terbuka pada <strong>{configuration}</strong>
        <span className="block text-muted-foreground">{label}</span>
      </p>
      <RedactedCredential credential={SAMPLE_CREDENTIAL} revealed={revealed} />
      <ul className="grid gap-1 text-sm">
        {GUARANTEES.map(([key, name]) => (
          <li key={key} className="flex items-center gap-2">
            {guarantees[key] ? (
              <Check className="size-4 text-accepted" aria-label="ya" />
            ) : (
              <X className="size-4 text-rejected" aria-label="tidak" />
            )}
            {name}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Data pada contoh ini sintetis. Pada B1-B4 verifier hanya mengetahui klaim threshold, issuer, challenge, dan verifier.
      </p>
    </div>
  );
}
