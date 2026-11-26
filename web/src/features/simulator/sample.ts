import type { CredentialView } from '@/domain';

/** Synthetic credential used to illustrate what each configuration discloses (same values as the README simulation). */
export const SAMPLE_CREDENTIAL: CredentialView = {
  id: 'cred-sample',
  issuerId: 'issuer-simulation',
  holderPublicKey: '0x7c3d9a41e8b05f2c6d1a',
  studentNumber: '2210001',
  fullName: 'Test Student',
  degree: 'S1 Teknik Komputer',
  graduationDate: '2026-08-01',
  gpa: 375,
  issuedAt: Date.UTC(2026, 7, 1),
};
