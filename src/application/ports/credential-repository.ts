import type { CredentialId, SignedCredential } from '../../domain/index.js';

export interface CredentialRepository {
  save(credential: SignedCredential): Promise<void>;
  findById(id: CredentialId): Promise<SignedCredential | undefined>;
}
