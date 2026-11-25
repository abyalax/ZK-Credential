import type { ChallengeListing, IssuerProfile } from '../../application/index.js';
import type { Challenge, ChallengeStatus, Proof, SignedCredential } from '../../domain/index.js';

/** Wire shapes of docs/ui/contract.md. Mapping is explicit field by field, so a new domain field never leaks by accident. */
export interface CredentialView {
  readonly id: string;
  readonly issuerId: string;
  readonly holderPublicKey: string;
  readonly studentNumber: string;
  readonly fullName: string;
  readonly degree: string;
  readonly graduationDate: string;
  readonly gpa: number;
  readonly issuedAt: number;
}

/** The issuer signature is deliberately left out. */
export const credentialView = ({ credential }: SignedCredential): CredentialView => ({
  id: credential.id,
  issuerId: credential.issuerId,
  holderPublicKey: credential.holderPublicKey,
  studentNumber: credential.studentNumber,
  fullName: credential.fullName,
  degree: credential.degree,
  graduationDate: credential.graduationDate,
  gpa: credential.gpa,
  issuedAt: credential.issuedAt,
});

export const issuerView = ({ issuer, registered }: IssuerProfile) => ({
  id: issuer.id,
  name: issuer.name,
  publicKey: issuer.publicKey,
  registered,
});

export const challengeView = (challenge: Challenge, status: ChallengeStatus) => ({
  value: challenge.value,
  verifierId: challenge.verifierId,
  issuedAt: challenge.issuedAt,
  expiresAt: challenge.expiresAt,
  status,
});

export const challengeListingView = ({ challenge, status }: ChallengeListing) => challengeView(challenge, status);

export const proofView = (proof: Proof, durationMs: number) => ({
  payload: proof.payload,
  publicSignals: {
    issuerPublicKey: proof.publicSignals.issuerPublicKey,
    gpaThreshold: proof.publicSignals.gpaThreshold,
    challenge: proof.publicSignals.challenge,
    verifierId: proof.publicSignals.verifierId,
  },
  sizeBytes: Buffer.byteLength(proof.payload, 'utf8'),
  durationMs,
});
