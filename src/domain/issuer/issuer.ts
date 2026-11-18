import type { Brand, Result } from '../../shared/index.js';
import { err, ok } from '../../shared/index.js';

export type IssuerId = Brand<string, 'IssuerId'>;
/** Serialized issuer public key (encoding is decided by the signature adapter). */
export type IssuerPublicKey = Brand<string, 'IssuerPublicKey'>;
/** Serialized issuer signature over a credential. */
export type IssuerSignature = Brand<string, 'IssuerSignature'>;

export interface Issuer {
  readonly id: IssuerId;
  readonly name: string;
  readonly publicKey: IssuerPublicKey;
}

export const asIssuerId = (value: string): IssuerId => value as IssuerId;
export const asIssuerPublicKey = (value: string): IssuerPublicKey => value as IssuerPublicKey;
export const asIssuerSignature = (value: string): IssuerSignature => value as IssuerSignature;

export type IssuerBindingRejection = 'ISSUER_NOT_REGISTERED';

/**
 * Issuer binding (domain side): the public key the proof was bound to must belong to a
 * registered issuer. The signature itself is checked inside the circuit.
 */
export const evaluateIssuerBinding = (
  issuerPublicKey: IssuerPublicKey,
  trustedIssuers: readonly Issuer[],
): Result<Issuer, IssuerBindingRejection> => {
  const issuer = trustedIssuers.find((candidate) => candidate.publicKey === issuerPublicKey);
  return issuer ? ok(issuer) : err('ISSUER_NOT_REGISTERED');
};
