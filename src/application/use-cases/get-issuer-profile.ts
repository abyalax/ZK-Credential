import type { Issuer } from '../../domain/index.js';
import type { IssuerRegistry } from '../ports/index.js';

export interface GetIssuerProfileDeps {
  readonly issuer: Issuer;
  readonly issuers: IssuerRegistry;
}

export interface IssuerProfile {
  readonly issuer: Issuer;
  /** True when the registry currently trusts this issuer's key. */
  readonly registered: boolean;
}

/** Issuer side: the configured issuer and whether the verifier-side registry trusts it. */
export const makeGetIssuerProfile = (deps: GetIssuerProfileDeps) => async (): Promise<IssuerProfile> => {
  const trusted = await deps.issuers.list();
  return { issuer: deps.issuer, registered: trusted.some((candidate) => candidate.id === deps.issuer.id) };
};
