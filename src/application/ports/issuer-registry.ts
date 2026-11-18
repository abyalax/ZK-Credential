import type { Issuer } from '../../domain/index.js';

export interface IssuerRegistry {
  /** All issuers currently trusted by the verifier. */
  list(): Promise<readonly Issuer[]>;
}
