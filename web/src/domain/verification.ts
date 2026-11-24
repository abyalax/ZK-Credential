import type { NodeId } from './run-event';

/** Domain `RejectionReason` plus the prove-stage outcome used by the P5 harness. */
export const REJECTION_REASONS = [
  'CHALLENGE_UNKNOWN',
  'CHALLENGE_VERIFIER_MISMATCH',
  'CHALLENGE_ALREADY_USED',
  'CHALLENGE_EXPIRED',
  'ISSUER_NOT_REGISTERED',
  'THRESHOLD_BELOW_REQUIRED',
  'PROOF_INVALID',
  'PROVE_FAILED',
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export type OutcomeStage = 'prove' | 'verify';

export interface Outcome {
  readonly accepted: boolean;
  readonly stage: OutcomeStage;
  /** `ACCEPTED` or a `RejectionReason`. */
  readonly reason: string;
}

const EXPLANATIONS: Record<RejectionReason, string> = {
  CHALLENGE_UNKNOWN: 'Challenge tidak pernah diterbitkan verifier.',
  CHALLENGE_VERIFIER_MISMATCH: 'Challenge diterbitkan untuk verifier lain.',
  CHALLENGE_ALREADY_USED: 'Challenge sudah dipakai oleh proof sebelumnya.',
  CHALLENGE_EXPIRED: 'Challenge sudah kedaluwarsa.',
  ISSUER_NOT_REGISTERED: 'Kunci issuer tidak terdaftar di IssuerRegistry.',
  THRESHOLD_BELOW_REQUIRED: 'Threshold pada proof lebih rendah dari kebijakan verifier.',
  PROOF_INVALID: 'Bukti Groth16 tidak lolos pemeriksaan kontrak verifier.',
  PROVE_FAILED: 'Holder tidak bisa membuat proof: witness tidak memenuhi circuit.',
};

export const explainReason = (reason: string): string =>
  reason === 'ACCEPTED' ? 'Proof diterima.' : (EXPLANATIONS[reason as RejectionReason] ?? 'Ditolak tanpa penjelasan terdaftar.');

/**
 * Which node turns red for a rejection: the holder cannot prove, the contract owns the registry and the
 * pairing check, and the verifier owns the remaining preconditions (verifier, threshold, challenge).
 */
export const rejectingNode = (reason: string): NodeId => {
  if (reason === 'PROVE_FAILED') return 'holder';
  if (reason === 'PROOF_INVALID' || reason === 'ISSUER_NOT_REGISTERED') return 'contract';
  return 'verifier';
};

export type ChallengeStatus = 'issued' | 'consumed' | 'expired';

export interface ChallengeView {
  readonly value: string;
  readonly verifierId: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly status: ChallengeStatus;
}
