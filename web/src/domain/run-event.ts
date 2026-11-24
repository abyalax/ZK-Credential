import type { ConfigurationId } from './configuration';
import type { Outcome } from './verification';

export const NODE_IDS = ['issuer', 'holder', 'verifier', 'contract'] as const;
export type NodeId = (typeof NODE_IDS)[number];

/** `preconditions.checked` and `issuer.checked` are proposed additions to ui-demo.md (see docs/ui/contract.md). */
export const KNOWN_STEPS = [
  'credential.issued',
  'challenge.issued',
  'witness.computed',
  'proof.generated',
  'presentation.sent',
  'preconditions.checked',
  'issuer.checked',
  'proof.verified',
  'challenge.consumed',
] as const;
export type KnownStep = (typeof KNOWN_STEPS)[number];

export type StepStatus = 'started' | 'completed' | 'rejected';

/** Public values only; see the allowlist below. */
export type EventData = Readonly<Record<string, string | number>>;

export interface RunEvent {
  readonly runId: string;
  /** Order of emission, used by the client to restore order. */
  readonly seq: number;
  readonly node: NodeId;
  readonly step: KnownStep | (string & {});
  readonly status: StepStatus;
  /** Epoch milliseconds from the server `Clock` port. */
  readonly at: number;
  readonly durationMs?: number;
  readonly data?: EventData;
  /** Rejection reason, the same value as in the P5 results. */
  readonly reason?: string;
}

/** The only keys an event may carry. Private keys, credential attributes and secrets are never sent. */
export const PUBLIC_DATA_KEYS = [
  'credentialId',
  'issuerId',
  'issuerPublicKey',
  'verifierId',
  'challenge',
  'expiresAt',
  'gpaThreshold',
  'attributesRevealed',
  'proofBytes',
  'publicSignals',
  'gasUsed',
] as const;

export const hasOnlyPublicData = (event: RunEvent): boolean =>
  Object.keys(event.data ?? {}).every((key) => (PUBLIC_DATA_KEYS as readonly string[]).includes(key));

/** Sent once as the last message of a run (`event: run.completed`). */
export interface RunSummary {
  readonly runId: string;
  readonly configuration: ConfigurationId;
  readonly scenarioId: string;
  readonly outcome: Outcome;
  readonly totalMs: number;
}

export const orderBySeq = (events: readonly RunEvent[]): RunEvent[] => [...events].sort((a, b) => a.seq - b.seq);
