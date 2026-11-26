import type { ConfigurationId } from './run-event.js';

export type ScenarioKind = 'honest' | 'attack';
export type ScenarioCategory = 'baseline' | 'threshold' | 'issuer' | 'holder' | 'replay' | 'malformed';
export type VariantName = 'threshold' | 'issuer' | 'holder' | 'full';

/** Metadata of one scenario, the same fields as `experiments/scenarios/types.ts` (a test keeps them in sync). */
export interface ScenarioInfo {
  readonly id: string;
  readonly title: string;
  readonly kind: ScenarioKind;
  readonly category: ScenarioCategory;
  /** Variants whose circuit leaves the attack open; it is accepted there and rejected elsewhere. */
  readonly openIn: readonly VariantName[];
  /** Expected reason in the `full` variant (B4). */
  readonly fullReason: string;
}

export interface ScenarioView extends ScenarioInfo {
  /** Configurations this server can run the scenario on. */
  readonly applicableConfigurations: readonly ConfigurationId[];
}

const WITHOUT_REPLAY_BINDING: readonly VariantName[] = ['threshold', 'issuer', 'holder'];
const WITHOUT_HOLDER_BINDING: readonly VariantName[] = ['threshold', 'issuer'];

const honest = (id: string, title: string): ScenarioInfo => ({
  id,
  title,
  kind: 'honest',
  category: 'baseline',
  openIn: [],
  fullReason: 'ACCEPTED',
});

const attackIn =
  (category: ScenarioCategory) =>
  (id: string, title: string, fullReason: string, openIn: readonly VariantName[] = []): ScenarioInfo => ({
    id,
    title,
    kind: 'attack',
    category,
    openIn,
    fullReason,
  });

const thresholdAttack = attackIn('threshold');
const issuerAttack = attackIn('issuer');
const holderAttack = attackIn('holder');
const replayAttack = attackIn('replay');
const malformedAttack = attackIn('malformed');

const PROVE_FAILED = 'PROVE_FAILED';
const PROOF_INVALID = 'PROOF_INVALID';

export const SCENARIO_CATALOG: readonly ScenarioInfo[] = [
  honest('valid-accepted', 'Valid proof for the credential owner is accepted'),
  honest('valid-gpa-equals-threshold', 'GPA exactly at the threshold is accepted'),
  honest('valid-gpa-maximum', 'Maximum GPA (4.00) is accepted'),
  honest('valid-other-verifier', 'Valid proof for a second verifier is accepted'),
  thresholdAttack('gpa-below-threshold', 'GPA below the claimed threshold cannot be proven', PROVE_FAILED),
  thresholdAttack(
    'threshold-below-policy',
    'Proof of a weaker threshold than the verifier requires is rejected',
    'THRESHOLD_BELOW_REQUIRED',
  ),
  issuerAttack('credential-tampered', 'Attribute changed after signing (GPA 2.50 -> 3.90)', PROVE_FAILED, ['threshold']),
  issuerAttack('signature-other-issuer', 'Signature made by another key than the claimed issuer', PROVE_FAILED, ['threshold']),
  issuerAttack('signature-malformed', 'Malformed signature string', PROVE_FAILED, ['threshold']),
  issuerAttack('issuer-unregistered', 'Credential signed by an issuer the verifier never registered', 'ISSUER_NOT_REGISTERED'),
  holderAttack(
    'holder-without-key',
    'Copy of the credential presented with the attacker key',
    PROVE_FAILED,
    WITHOUT_HOLDER_BINDING,
  ),
  holderAttack('holder-secret-guessed', 'Public key used as if it were the private key', PROVE_FAILED, WITHOUT_HOLDER_BINDING),
  holderAttack(
    'holder-secret-out-of-field',
    'Correct secret aliased above the field order (secret + r)',
    PROVE_FAILED,
    WITHOUT_HOLDER_BINDING,
  ),
  replayAttack('replay-same-proof', 'Accepted proof presented a second time', 'CHALLENGE_ALREADY_USED'),
  replayAttack(
    'replay-relabelled-challenge',
    'Used proof relabelled onto a fresh challenge of the same verifier',
    PROOF_INVALID,
    WITHOUT_REPLAY_BINDING,
  ),
  replayAttack(
    'relay-to-other-verifier',
    'Proof for verifier A relabelled for verifier B and its fresh challenge',
    PROOF_INVALID,
    WITHOUT_REPLAY_BINDING,
  ),
  replayAttack('wrong-verifier', 'Proof for verifier A presented to verifier B unchanged', 'CHALLENGE_VERIFIER_MISMATCH'),
  replayAttack('challenge-expired', 'Proof presented after the challenge expired', 'CHALLENGE_EXPIRED'),
  replayAttack('challenge-unknown', 'Challenge the verifier never issued', 'CHALLENGE_UNKNOWN'),
  malformedAttack('payload-not-json', 'Proof payload is not JSON', PROOF_INVALID),
  malformedAttack('payload-bad-shape', 'Proof payload has the wrong structure', PROOF_INVALID),
  malformedAttack('proof-bytes-tampered', 'Proof point pi_a changed', PROOF_INVALID),
  malformedAttack('signals-truncated', 'Last public signal removed from the payload', PROOF_INVALID),
  malformedAttack('signals-non-decimal', 'Public signal is not a decimal string', PROOF_INVALID),
  malformedAttack('signals-out-of-field', 'Last public signal aliased above the field order (s + r)', PROOF_INVALID),
  malformedAttack(
    'claims-challenge-out-of-field',
    'Claimed challenge does not fit the field (engine-level check)',
    PROOF_INVALID,
    WITHOUT_REPLAY_BINDING,
  ),
];
