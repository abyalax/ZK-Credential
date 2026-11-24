import type { CreateProofError, IssueCredentialError } from '@/domain';

export const ISSUE_ERROR_COPY: Record<IssueCredentialError, string> = {
  REQUIRED_FIELD_EMPTY: 'Isi NIM, nama, dan gelar.',
  GPA_OUT_OF_RANGE: 'IPK harus antara 0,00 dan 4,00.',
  GRADUATION_DATE_INVALID: 'Tanggal lulus harus berformat TTTT-BB-HH, misalnya 2026-08-01.',
  ISSUER_NOT_REGISTERED: 'Issuer belum terdaftar di IssuerRegistry. Daftarkan dulu lewat CLI: pnpm cli register-issuer.',
  SIGNER_KEY_MISMATCH: 'Kunci penanda tangan tidak cocok dengan kunci issuer terdaftar.',
};

export const PROOF_ERROR_COPY: Record<CreateProofError, string> = {
  CREDENTIAL_NOT_FOUND: 'Kredensial tidak ditemukan di wallet.',
  ATTRIBUTE_BELOW_THRESHOLD: 'IPK pada kredensial ini di bawah threshold, sehingga proof tidak bisa dibuat.',
};
