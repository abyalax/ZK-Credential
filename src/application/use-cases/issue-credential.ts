import type { CredentialError, IssuerId, SignedCredential } from '../../domain/index.js';
import { createCredential } from '../../domain/index.js';
import type { Result } from '../../shared/index.js';
import { err, ok } from '../../shared/index.js';
import type { Clock, CredentialRepository, CredentialSigner, IssuerRegistry, Randomness } from '../ports/index.js';

export interface IssueCredentialDeps {
  readonly credentials: CredentialRepository;
  readonly issuers: IssuerRegistry;
  readonly signer: CredentialSigner;
  readonly clock: Clock;
  readonly randomness: Randomness;
}

export interface IssueCredentialInput {
  readonly issuerId: IssuerId;
  readonly holderPublicKey: string;
  readonly studentNumber: string;
  readonly fullName: string;
  readonly degree: string;
  readonly graduationDate: string;
  /** GPA multiplied by 100 (3.75 -> 375). */
  readonly gpa: number;
}

export type IssueCredentialError = CredentialError | 'ISSUER_NOT_REGISTERED' | 'SIGNER_KEY_MISMATCH';

export const makeIssueCredential =
  (deps: IssueCredentialDeps) =>
  async (input: IssueCredentialInput): Promise<Result<SignedCredential, IssueCredentialError>> => {
    const trusted = await deps.issuers.list();
    const issuer = trusted.find((candidate) => candidate.id === input.issuerId);
    if (!issuer) return err('ISSUER_NOT_REGISTERED');
    if (deps.signer.publicKey && deps.signer.publicKey !== issuer.publicKey) return err('SIGNER_KEY_MISMATCH');

    const created = createCredential({
      ...input,
      id: deps.randomness.hex(16),
      issuedAt: deps.clock.now(),
    });
    if (!created.ok) return created;

    const signature = await deps.signer.sign(created.value);
    const signed: SignedCredential = { credential: created.value, signature };
    await deps.credentials.save(signed);
    return ok(signed);
  };
