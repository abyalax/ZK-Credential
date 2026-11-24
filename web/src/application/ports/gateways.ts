import type {
  ChallengeView,
  ConfigurationId,
  CreateProofError,
  CreateProofInput,
  CredentialView,
  IssueCredentialError,
  IssueCredentialInput,
  IssuerView,
  Outcome,
  ProofView,
  RunEvent,
  RunSummary,
  Scenario,
  VerifyInput,
} from '@/domain';
import type { Result } from '@/shared';

/** Everything the UI needs from the server. Protocol rejections are normal results, not errors. */
export interface IssuerGateway {
  profile(): Promise<IssuerView>;
  issued(): Promise<readonly CredentialView[]>;
  issue(input: IssueCredentialInput): Promise<Result<CredentialView, IssueCredentialError>>;
}

export interface HolderGateway {
  credentials(): Promise<readonly CredentialView[]>;
  createProof(input: CreateProofInput): Promise<Result<ProofView, CreateProofError>>;
}

export interface IssueChallengeInput {
  readonly verifierId: string;
  readonly ttlMs: number;
}

export interface VerifierGateway {
  challenges(): Promise<readonly ChallengeView[]>;
  issueChallenge(input: IssueChallengeInput): Promise<ChallengeView>;
  verify(input: VerifyInput): Promise<Outcome & { readonly durationMs: number }>;
}

export interface StartRunInput {
  readonly configuration: ConfigurationId;
  readonly scenarioId: string;
}

export interface RunHandlers {
  readonly onEvent: (event: RunEvent) => void;
  readonly onCompleted: (summary: RunSummary) => void;
  readonly onError: (message: string) => void;
}

export interface RunGateway {
  scenarios(): Promise<readonly Scenario[]>;
  start(input: StartRunInput): Promise<{ readonly runId: string }>;
  /** Streams events of one run; returns the unsubscribe function. */
  subscribe(runId: string, handlers: RunHandlers): () => void;
}

export interface Container {
  readonly issuer: IssuerGateway;
  readonly holder: HolderGateway;
  readonly verifier: VerifierGateway;
  readonly runs: RunGateway;
  readonly mode: 'mock' | 'http';
}
