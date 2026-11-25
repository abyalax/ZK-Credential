import { CONFIGURATION_IDS, type ConfigurationId, isCanonicalChallenge } from '../../application/index.js';
import { type Gpa, toGpa } from '../../domain/index.js';
import { badRequest } from './http-error.js';

type Fields = Readonly<Record<string, unknown>>;

const fieldsOf = (body: unknown, what: string): Fields => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw badRequest(`${what} must be a JSON object`);
  return body as Fields;
};

const text = (fields: Fields, key: string): string => {
  const value = fields[key];
  if (typeof value !== 'string') throw badRequest(`${key} must be a string`);
  return value;
};

const nonEmpty = (fields: Fields, key: string): string => {
  const value = text(fields, key);
  if (value.trim() === '') throw badRequest(`${key} must not be empty`);
  return value;
};

const finite = (fields: Fields, key: string): number => {
  const value = fields[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw badRequest(`${key} must be a number`);
  return value;
};

/** GPA x 100 as the contract defines it; anything outside 0..400 or not whole is a broken request here. */
const gpaField = (fields: Fields, key: string): Gpa => {
  const gpa = toGpa(finite(fields, key));
  if (!gpa.ok) throw badRequest(`${key} must be a whole number between 0 and 400 (GPA x 100)`);
  return gpa.value;
};

const MAX_TTL_MS = 24 * 60 * 60 * 1000;

export interface IssueCredentialBody {
  readonly studentNumber: string;
  readonly fullName: string;
  readonly degree: string;
  readonly graduationDate: string;
  /** Not range-checked here: the domain reports `GPA_OUT_OF_RANGE` as a normal result. */
  readonly gpa: number;
}

export const parseIssueCredential = (body: unknown): IssueCredentialBody => {
  const fields = fieldsOf(body, 'Body');
  return {
    studentNumber: text(fields, 'studentNumber'),
    fullName: text(fields, 'fullName'),
    degree: text(fields, 'degree'),
    graduationDate: text(fields, 'graduationDate'),
    gpa: finite(fields, 'gpa'),
  };
};

const challengeField = (fields: Fields, key: string): string => {
  const value = text(fields, key);
  if (!isCanonicalChallenge(value)) throw badRequest(`${key} must be 62 lowercase hex characters`);
  return value;
};

export interface CreateProofBody {
  readonly credentialId: string;
  readonly challenge: string;
  readonly verifierId: string;
  readonly threshold: Gpa;
}

export const parseCreateProof = (body: unknown): CreateProofBody => {
  const fields = fieldsOf(body, 'Body');
  return {
    credentialId: nonEmpty(fields, 'credentialId'),
    challenge: challengeField(fields, 'challenge'),
    verifierId: nonEmpty(fields, 'verifierId'),
    threshold: gpaField(fields, 'threshold'),
  };
};

export interface IssueChallengeBody {
  readonly verifierId: string;
  readonly ttlMs: number;
}

export const parseIssueChallenge = (body: unknown): IssueChallengeBody => {
  const fields = fieldsOf(body, 'Body');
  const ttlMs = finite(fields, 'ttlMs');
  if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > MAX_TTL_MS)
    throw badRequest(`ttlMs must be a whole number of 1..${MAX_TTL_MS}`);
  return { verifierId: nonEmpty(fields, 'verifierId'), ttlMs };
};

export interface VerifyBody {
  readonly payload: string;
  readonly signals: {
    readonly issuerPublicKey: string;
    readonly gpaThreshold: Gpa;
    readonly challenge: string;
    readonly verifierId: string;
  };
  readonly verifierId: string;
  readonly requiredThreshold: Gpa;
}

export const parseVerify = (body: unknown): VerifyBody => {
  const fields = fieldsOf(body, 'Body');
  const proof = fieldsOf(fields.proof, 'proof');
  const signals = fieldsOf(proof.publicSignals, 'proof.publicSignals');
  return {
    payload: text(proof, 'payload'),
    signals: {
      issuerPublicKey: text(signals, 'issuerPublicKey'),
      gpaThreshold: gpaField(signals, 'gpaThreshold'),
      challenge: text(signals, 'challenge'),
      verifierId: text(signals, 'verifierId'),
    },
    verifierId: nonEmpty(fields, 'verifierId'),
    requiredThreshold: gpaField(fields, 'requiredThreshold'),
  };
};

export interface StartRunBody {
  readonly configuration: ConfigurationId;
  readonly scenarioId: string;
}

export const parseStartRun = (body: unknown): StartRunBody => {
  const fields = fieldsOf(body, 'Body');
  const configuration = text(fields, 'configuration');
  if (!(CONFIGURATION_IDS as readonly string[]).includes(configuration)) {
    throw badRequest(`configuration must be one of ${CONFIGURATION_IDS.join(', ')}`);
  }
  return { configuration: configuration as ConfigurationId, scenarioId: nonEmpty(fields, 'scenarioId') };
};
