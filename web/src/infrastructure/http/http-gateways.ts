import type { HolderGateway, IssuerGateway, RunGateway, VerifierGateway } from '@/application';
import type { ChallengeView, CredentialView, IssuerView, Outcome, ProofView, Scenario } from '@/domain';
import { type Envelope, get, post } from './client';
import { subscribeToRun } from './sse';

/** Endpoints are listed in docs/ui/contract.md. */
export const createHttpIssuer = (): IssuerGateway => ({
  profile: () => get<IssuerView>('/api/issuer'),
  issued: () => get<readonly CredentialView[]>('/api/issuer/credentials'),
  issue: (input) => post<Envelope<CredentialView, never>>('/api/issuer/credentials', input),
});

export const createHttpHolder = (): HolderGateway => ({
  credentials: () => get<readonly CredentialView[]>('/api/holder/credentials'),
  createProof: (input) => post<Envelope<ProofView, never>>('/api/holder/proofs', input),
});

export const createHttpVerifier = (): VerifierGateway => ({
  challenges: () => get<readonly ChallengeView[]>('/api/verifier/challenges'),
  issueChallenge: (input) => post<ChallengeView>('/api/verifier/challenges', input),
  verify: (input) => post<Outcome & { durationMs: number }>('/api/verifier/verifications', input),
});

export const createHttpRuns = (): RunGateway => ({
  scenarios: () => get<readonly Scenario[]>('/api/scenarios'),
  start: (input) => post<{ runId: string }>('/api/runs', input),
  subscribe: subscribeToRun,
});
