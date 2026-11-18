export type {
  GenerateProofDeps,
  GenerateProofError,
  GenerateProofInput,
} from './generate-proof.js';
export { makeGenerateProof } from './generate-proof.js';
export type { IssueChallengeDeps, IssueChallengeInput } from './issue-challenge.js';
export { DEFAULT_CHALLENGE_TTL_MS, makeIssueChallenge } from './issue-challenge.js';
export type {
  IssueCredentialDeps,
  IssueCredentialError,
  IssueCredentialInput,
} from './issue-credential.js';
export { makeIssueCredential } from './issue-credential.js';
export type { VerifyCredentialDeps, VerifyCredentialInput } from './verify-credential.js';
export { makeVerifyCredential } from './verify-credential.js';
