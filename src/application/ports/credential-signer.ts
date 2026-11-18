import type { Credential, IssuerSignature } from '../../domain/index.js';

/** Signs credentials with the issuer's private key (kept in infrastructure/key-management). */
export interface CredentialSigner {
  sign(credential: Credential): Promise<IssuerSignature>;
}
