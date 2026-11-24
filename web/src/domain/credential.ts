import type { ConfigurationId } from './configuration';

/** The 8 attributes counted by `attributesRevealed` in `experiments/configurations`. */
export const CREDENTIAL_ATTRIBUTES = [
  { key: 'studentNumber', label: 'NIM' },
  { key: 'fullName', label: 'Nama' },
  { key: 'degree', label: 'Gelar' },
  { key: 'graduationDate', label: 'Tanggal lulus' },
  { key: 'gpa', label: 'IPK' },
  { key: 'issuerId', label: 'Issuer' },
  { key: 'holderPublicKey', label: 'Kunci publik holder' },
  { key: 'issuedAt', label: 'Waktu terbit' },
] as const;

export type AttributeKey = (typeof CREDENTIAL_ATTRIBUTES)[number]['key'];

export interface CredentialView {
  readonly id: string;
  readonly issuerId: string;
  readonly holderPublicKey: string;
  readonly studentNumber: string;
  readonly fullName: string;
  readonly degree: string;
  readonly graduationDate: string;
  /** Scaled by 100 (350 = 3.50). */
  readonly gpa: number;
  readonly issuedAt: number;
}

export interface IssuerView {
  readonly id: string;
  readonly name: string;
  readonly publicKey: string;
  readonly registered: boolean;
}

export interface Knowledge {
  readonly revealed: readonly AttributeKey[];
  readonly hidden: readonly AttributeKey[];
}

const ALL_KEYS: readonly AttributeKey[] = CREDENTIAL_ATTRIBUTES.map((attribute) => attribute.key);

/** What the verifier learns: A = all 8 attributes, SD = exact GPA, B1-B4 = none (only the threshold claim). */
export const knowledgeFor = (configuration: ConfigurationId): Knowledge => {
  const revealed: readonly AttributeKey[] = configuration === 'A' ? ALL_KEYS : configuration === 'SD' ? ['gpa'] : [];
  return { revealed, hidden: ALL_KEYS.filter((key) => !revealed.includes(key)) };
};
