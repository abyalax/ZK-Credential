export interface PublicSignalsView {
  readonly issuerPublicKey: string;
  /** Scaled by 100. */
  readonly gpaThreshold: number;
  readonly challenge: string;
  readonly verifierId: string;
}

/** A proof as the UI handles it: opaque payload plus the public claims. */
export interface ProofView {
  readonly payload: string;
  readonly publicSignals: PublicSignalsView;
  readonly sizeBytes: number;
  readonly durationMs: number;
}

export interface IssueCredentialInput {
  readonly studentNumber: string;
  readonly fullName: string;
  readonly degree: string;
  readonly graduationDate: string;
  /** Scaled by 100. */
  readonly gpa: number;
}

export type IssueCredentialError =
  | 'REQUIRED_FIELD_EMPTY'
  | 'GPA_OUT_OF_RANGE'
  | 'GRADUATION_DATE_INVALID'
  | 'ISSUER_NOT_REGISTERED'
  | 'SIGNER_KEY_MISMATCH';

export type CreateProofError = 'CREDENTIAL_NOT_FOUND' | 'ATTRIBUTE_BELOW_THRESHOLD';

export interface CreateProofInput {
  readonly credentialId: string;
  readonly challenge: string;
  readonly verifierId: string;
  /** Scaled by 100. */
  readonly threshold: number;
}

export interface VerifyInput {
  readonly proof: ProofView;
  readonly verifierId: string;
  /** Scaled by 100. */
  readonly requiredThreshold: number;
}
