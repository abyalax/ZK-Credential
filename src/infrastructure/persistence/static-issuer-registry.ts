import type { IssuerRegistry } from '../../application/index.js';
import type { Issuer } from '../../domain/index.js';

export const createStaticIssuerRegistry = (issuers: readonly Issuer[]): IssuerRegistry => ({
  list: async () => issuers,
});
