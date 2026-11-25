import type { SignedCredential } from '../../domain/index.js';
import type { CredentialRepository } from '../ports/index.js';

export interface ListCredentialsDeps {
  readonly credentials: CredentialRepository;
}

/** Wallet and issuance log: every stored credential, oldest first. */
export const makeListCredentials = (deps: ListCredentialsDeps) => async (): Promise<readonly SignedCredential[]> =>
  deps.credentials.list();
