import type { Brand, Result } from '../../shared/index.js';
import { err, ok } from '../../shared/index.js';
import type { HolderPublicKey } from '../holder/index.js';
import type { IssuerId, IssuerSignature } from '../issuer/index.js';
import type { Gpa } from './gpa.js';
import { toGpa } from './gpa.js';

export type CredentialId = Brand<string, 'CredentialId'>;

export interface Credential {
  readonly id: CredentialId;
  readonly issuerId: IssuerId;
  readonly holderPublicKey: HolderPublicKey;
  readonly studentNumber: string;
  readonly fullName: string;
  readonly degree: string;
  /** ISO 8601 calendar date (YYYY-MM-DD). */
  readonly graduationDate: string;
  readonly gpa: Gpa;
  /** Epoch milliseconds. */
  readonly issuedAt: number;
}

/** Unvalidated input; `createCredential` turns it into a `Credential`. */
export interface CredentialDraft {
  readonly id: string;
  readonly issuerId: string;
  readonly holderPublicKey: string;
  readonly studentNumber: string;
  readonly fullName: string;
  readonly degree: string;
  readonly graduationDate: string;
  readonly gpa: number;
  readonly issuedAt: number;
}

export interface SignedCredential {
  readonly credential: Credential;
  readonly signature: IssuerSignature;
}

export type CredentialError = 'REQUIRED_FIELD_EMPTY' | 'GPA_OUT_OF_RANGE' | 'GRADUATION_DATE_INVALID';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isIsoDate = (value: string): boolean =>
  ISO_DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

const isBlank = (value: string): boolean => value.trim().length === 0;

/** Pure validation of a draft. No clock, randomness or I/O: callers supply `id` and `issuedAt`. */
export const createCredential = (draft: CredentialDraft): Result<Credential, CredentialError> => {
  const requiredFields = [draft.id, draft.issuerId, draft.holderPublicKey, draft.studentNumber, draft.fullName, draft.degree];
  if (requiredFields.some(isBlank)) return err('REQUIRED_FIELD_EMPTY');
  if (!isIsoDate(draft.graduationDate)) return err('GRADUATION_DATE_INVALID');

  const gpa = toGpa(draft.gpa);
  if (!gpa.ok) return gpa;

  return ok({
    id: draft.id as CredentialId,
    issuerId: draft.issuerId as IssuerId,
    holderPublicKey: draft.holderPublicKey as HolderPublicKey,
    studentNumber: draft.studentNumber,
    fullName: draft.fullName,
    degree: draft.degree,
    graduationDate: draft.graduationDate,
    gpa: gpa.value,
    issuedAt: draft.issuedAt,
  });
};

export const asCredentialId = (value: string): CredentialId => value as CredentialId;

export const satisfiesGpaThreshold = (credential: Credential, threshold: Gpa): boolean => credential.gpa >= threshold;
