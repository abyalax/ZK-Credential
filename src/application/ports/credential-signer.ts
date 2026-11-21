import type { Credential, IssuerSignature } from '../../domain/index.js';

/** Signs credentials with the issuer's private key (kept in infrastructure/key-management). */
export interface CredentialSigner {
  /** Public half of the configured signing key, when the adapter is bound to one issuer. */
  readonly publicKey?: import('../../domain/index.js').IssuerPublicKey;
  sign: (credential: Credential) => Promise<IssuerSignature>;
}
