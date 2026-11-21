import { createHash } from 'node:crypto';
import type { Credential } from '../../domain/index.js';

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
  BigInt(credential.holderPublicKey),
  encodeCredentialText(credential.studentNumber),
  encodeCredentialText(credential.fullName),
  encodeCredentialText(credential.degree),
  encodeCredentialText(credential.graduationDate),
  BigInt(credential.gpa),
  BigInt(credential.issuedAt),
];
