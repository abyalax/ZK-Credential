import type { Issuer } from '../../domain/index.js';

export interface IssuerRegistry {
  /** All issuers currently trusted by the verifier. On-chain adapters query the registry here. */
  list: () => Promise<readonly Issuer[]>;
}
