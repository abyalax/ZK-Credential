import type { ChallengeView, CreateProofInput, IssueCredentialInput, Outcome, ProofView, VerifyInput } from '@/domain';
import type { HolderGateway, IssueChallengeInput, IssuerGateway, VerifierGateway } from '../ports';

/** Thin use cases for the role pages. They exist so that features never talk to a gateway directly. */
export const makeIssueCredential = (issuer: IssuerGateway) => (input: IssueCredentialInput) => issuer.issue(input);

export const makeCreateProof = (holder: HolderGateway) => (input: CreateProofInput) => holder.createProof(input);

export const makeIssueChallenge =
  (verifier: VerifierGateway) =>
  (input: IssueChallengeInput): Promise<ChallengeView> =>
    verifier.issueChallenge(input);

export const makeVerifyPresentation =
  (verifier: VerifierGateway) =>
  (input: VerifyInput): Promise<Outcome & { readonly durationMs: number }> =>
    verifier.verify(input);

export type { ProofView };
