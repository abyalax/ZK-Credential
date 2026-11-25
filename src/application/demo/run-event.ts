/**
 * Event model of the demo run stream (docs/ui/contract.md). Kept free of HTTP so the same events
 * could be written to a file or a test log.
 */
export type NodeId = 'issuer' | 'holder' | 'verifier' | 'contract';
export type StepStatus = 'started' | 'completed' | 'rejected';
export type EventData = Readonly<Record<string, string | number>>;

export interface RunEvent {
  readonly runId: string;
  /** Order of emission; the client restores order and drops repeats by this number. */
  readonly seq: number;
  readonly node: NodeId;
  readonly step: string;
  readonly status: StepStatus;
  /** Epoch milliseconds from the `Clock` port. */
  readonly at: number;
  readonly durationMs?: number;
  readonly data?: EventData;
  /** Only on `rejected`: the same reason value as in the P5 results. */
  readonly reason?: string;
}

/** What a step reports before the emitter adds `runId`, `seq` and `at`. */
export type EventDraft = Omit<RunEvent, 'runId' | 'seq' | 'at'>;

export const CONFIGURATION_IDS = ['A', 'SD', 'B1', 'B2', 'B3', 'B4'] as const;
export type ConfigurationId = (typeof CONFIGURATION_IDS)[number];

export interface RunOutcome {
  readonly accepted: boolean;
  readonly stage: 'prove' | 'verify';
  /** `ACCEPTED`, `PROVE_FAILED` or a domain `RejectionReason`. */
  readonly reason: string;
}

export interface RunSummary {
  readonly runId: string;
  readonly configuration: ConfigurationId;
  readonly scenarioId: string;
  readonly outcome: RunOutcome;
  readonly totalMs: number;
}

/**
 * The only keys an event may carry. Private keys, credential attributes, signatures and witnesses
 * never leave the server (docs/ui/contract.md, "Allowlist data publik").
 */
export const PUBLIC_DATA_KEYS: readonly string[] = [
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
];

export const privateDataKeys = (data: EventData | undefined): readonly string[] =>
  Object.keys(data ?? {}).filter((key) => !PUBLIC_DATA_KEYS.includes(key));

export const ACCEPTED_OUTCOME: RunOutcome = { accepted: true, stage: 'verify', reason: 'ACCEPTED' };
export const PROVE_FAILED_OUTCOME: RunOutcome = { accepted: false, stage: 'prove', reason: 'PROVE_FAILED' };
