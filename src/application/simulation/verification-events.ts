import type { RejectionReason, VerificationAccepted } from '../../domain/index.js';
import type { Result } from '../../shared/index.js';
import type { EventDraft } from './run-event.js';

export interface VerificationFacts {
  readonly issuerPublicKey: string;
  /** Known when the registry lists the issuer; absent for an unregistered key. */
  readonly issuerId?: string;
  /** Wall time of the whole verification, preconditions included. */
  readonly durationMs: number;
  /** Reference figure from the P6 benchmark, shown on an accepted verification. Not measured per run. */
  readonly gasUsed?: number;
}

/** Rejections the verifier raises before the contract is consulted. */
const VERIFIER_PRECONDITIONS: readonly RejectionReason[] = [
  'CHALLENGE_UNKNOWN',
  'CHALLENGE_VERIFIER_MISMATCH',
  'CHALLENGE_ALREADY_USED',
  'CHALLENGE_EXPIRED',
  'THRESHOLD_BELOW_REQUIRED',
];

const issuerData = (facts: VerificationFacts): Record<string, string> => ({
  issuerPublicKey: facts.issuerPublicKey,
  ...(facts.issuerId ? { issuerId: facts.issuerId } : {}),
});

const rejected = (node: EventDraft['node'], step: string, reason: string, extra: Partial<EventDraft> = {}): EventDraft => ({
  node,
  step,
  status: 'rejected',
  reason,
  ...extra,
});

const completed = (node: EventDraft['node'], step: string, extra: Partial<EventDraft> = {}): EventDraft => ({
  node,
  step,
  status: 'completed',
  ...extra,
});

/**
 * Turns the verdict of `makeVerifyCredential` into display steps, following the rejection table in
 * docs/ui/contract.md. The order is the display order, not the exact order of `evaluatePreconditions`.
 */
export const verificationEvents = (
  verdict: Result<VerificationAccepted, RejectionReason>,
  facts: VerificationFacts,
): readonly EventDraft[] => {
  const reason = verdict.ok ? undefined : verdict.error;
  if (reason && VERIFIER_PRECONDITIONS.includes(reason)) return [rejected('verifier', 'preconditions.checked', reason)];

  const preconditions = completed('verifier', 'preconditions.checked');
  if (reason === 'ISSUER_NOT_REGISTERED') {
    return [preconditions, rejected('contract', 'issuer.checked', reason, { data: issuerData(facts) })];
  }

  const issuer = completed('contract', 'issuer.checked', { data: issuerData(facts) });
  const started: EventDraft = { node: 'contract', step: 'proof.verified', status: 'started' };
  if (reason)
    return [preconditions, issuer, started, rejected('contract', 'proof.verified', reason, { durationMs: facts.durationMs })];
  return [
    preconditions,
    issuer,
    started,
    completed('contract', 'proof.verified', {
      durationMs: facts.durationMs,
      ...(facts.gasUsed === undefined ? {} : { data: { gasUsed: facts.gasUsed } }),
    }),
    completed('verifier', 'challenge.consumed'),
  ];
};
