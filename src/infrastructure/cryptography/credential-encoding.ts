import { createHash } from 'node:crypto';
import type { Credential } from '../../domain/index.js';

/** Order of the BN254 scalar field: every circuit input must be a canonical integer below it. */
export const BN254_FIELD_ORDER =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const CANONICAL_DECIMAL = /^(?:0|[1-9]\d*)$/;

/**
 * Parses a canonical decimal field element. Error messages never include `value`, because it may
 * be a private key.
 */
export const parseFieldElement = (value: string, label: string): bigint => {
  if (!CANONICAL_DECIMAL.test(value)) {
    throw new TypeError(`${label} must be a canonical decimal integer`);
  }
  const parsed = BigInt(value);
  if (parsed >= BN254_FIELD_ORDER) {
    throw new TypeError(`${label} must be below the BN254 scalar field order`);
  }
  return parsed;
};

/** Canonical protocol encoding: 248-bit SHA-256 prefix, guaranteed below the BN254 scalar field. */
export const encodeCredentialText = (value: string): bigint =>
  BigInt(
    `0x${createHash('sha256').update('zk-credential:v1:').update(value, 'utf8').digest('hex').slice(0, 62)}`,
  );

export const credentialCommitmentInputs = (
  credential: Credential,
): readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] => [
  encodeCredentialText(credential.id),
  encodeCredentialText(credential.issuerId),
  parseFieldElement(credential.holderPublicKey, 'Holder public key'),
  encodeCredentialText(credential.studentNumber),
  encodeCredentialText(credential.fullName),
  encodeCredentialText(credential.degree),
  encodeCredentialText(credential.graduationDate),
  BigInt(credential.gpa),
  BigInt(credential.issuedAt),
];
