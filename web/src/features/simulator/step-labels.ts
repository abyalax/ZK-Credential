import type { NodeId } from '@/domain';

const LABELS: Readonly<Record<string, string>> = {
  'credential.issued': 'Kredensial diterbitkan',
  'challenge.issued': 'Challenge diterbitkan',
  'witness.computed': 'Witness dihitung',
  'proof.generated': 'Proof dibuat',
  'presentation.sent': 'Presentasi dikirim',
  'preconditions.checked': 'Prasyarat diperiksa',
  'issuer.checked': 'Issuer dicek di registry',
  'proof.verified': 'Proof diverifikasi',
  'challenge.consumed': 'Challenge dikonsumsi',
};

export const stepLabel = (step: string): string => LABELS[step] ?? step;

export const NODE_LABEL: Readonly<Record<NodeId, string>> = {
  issuer: 'Issuer',
  holder: 'Holder',
  verifier: 'Verifier',
  contract: 'Contract',
};
