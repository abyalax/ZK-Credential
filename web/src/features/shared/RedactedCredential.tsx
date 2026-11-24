import { type AttributeKey, CREDENTIAL_ATTRIBUTES, type CredentialView } from '@/domain';
import { formatGpa, shorten } from '@/shared';
import { cn } from '@/ui/lib/cn';

const displayValue = (credential: CredentialView, key: AttributeKey): string => {
  switch (key) {
    case 'gpa':
      return formatGpa(credential.gpa);
    case 'issuedAt':
      return new Date(credential.issuedAt).toLocaleString('id-ID');
    case 'holderPublicKey':
      return shorten(credential.holderPublicKey);
    default:
      return credential[key];
  }
};

interface Props {
  readonly credential: CredentialView;
  /** Attributes the verifier can read; every other row is blacked out. */
  readonly revealed: readonly AttributeKey[];
  readonly className?: string;
}

/** The credential as the verifier sees it: readable rows for what is disclosed, redaction bars for the rest. */
export function RedactedCredential({ credential, revealed, className }: Props) {
  return (
    <dl className={cn('divide-y rounded-lg border bg-card text-sm', className)}>
      {CREDENTIAL_ATTRIBUTES.map(({ key, label }) => {
        const visible = revealed.includes(key);
        return (
          <div key={key} className="flex items-center justify-between gap-4 px-3 py-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={cn('min-w-0 truncate text-right', visible && 'font-serif text-base font-semibold')}>
              {visible ? (
                displayValue(credential, key)
              ) : (
                <span
                  className="inline-block h-4 w-28 rounded-sm bg-redaction align-middle"
                  role="img"
                  aria-label="disembunyikan"
                />
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
