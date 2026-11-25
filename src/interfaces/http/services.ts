import type { Container } from '../composition/index.js';

/**
 * Everything the HTTP adapter needs from the composition root. It is a slice of `Container`, so the
 * server runs the same use cases as the CLI, and tests can build the slice from fakes.
 */
export type HttpServices = Pick<
  Container,
  | 'clock'
  | 'issuer'
  | 'holderKeyring'
  | 'getIssuerProfile'
  | 'listCredentials'
  | 'listChallenges'
  | 'issueCredential'
  | 'issueChallenge'
  | 'generateProof'
  | 'verifyCredential'
  | 'runScenario'
>;
