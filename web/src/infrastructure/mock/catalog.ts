import type { ConfigurationId, Scenario, ScenarioCategory, VariantName } from '@/domain';

/** Same ids, titles, categories, `openIn` and reasons as `experiments/scenarios/catalog.ts` (22 attacks + 4 honest). */
const ALL: readonly ConfigurationId[] = ['A', 'SD', 'B1', 'B2', 'B3', 'B4'];
const ZK: readonly ConfigurationId[] = ['B1', 'B2', 'B3', 'B4'];
const WITHOUT_REPLAY_BINDING: readonly VariantName[] = ['threshold', 'issuer', 'holder'];

type AttackRow = readonly [
  id: string,
  category: ScenarioCategory,
  title: string,
  fullReason: string,
  openIn?: readonly VariantName[],
];

const honest = ([id, title]: readonly [string, string]): Scenario => ({
  id,
  title,
  kind: 'honest',
  category: 'baseline',
  openIn: [],
  fullReason: 'ACCEPTED',
  applicableConfigurations: ALL,
});

const attack = ([id, category, title, fullReason, openIn = []]: AttackRow): Scenario => ({
  id,
  title,
  kind: 'attack',
  category,
  openIn,
  fullReason,
  applicableConfigurations: ZK,
});

const HONEST_ROWS: readonly (readonly [string, string])[] = [
  ['valid-accepted', 'Proof sah untuk pemilik kredensial diterima'],
  ['valid-gpa-equals-threshold', 'IPK tepat di threshold diterima'],
  ['valid-gpa-maximum', 'IPK maksimum (4,00) diterima'],
  ['valid-other-verifier', 'Proof sah untuk verifier kedua diterima'],
];

const ATTACK_ROWS: readonly AttackRow[] = [
  ['gpa-below-threshold', 'threshold', 'IPK di bawah threshold tidak bisa dibuktikan', 'PROVE_FAILED'],
  ['threshold-below-policy', 'threshold', 'Threshold lebih lemah dari kebijakan verifier', 'THRESHOLD_BELOW_REQUIRED'],
  [
    'credential-tampered',
    'issuer',
    'Atribut diubah setelah ditandatangani (IPK 2,50 menjadi 3,90)',
    'PROVE_FAILED',
    ['threshold'],
  ],
  ['signature-other-issuer', 'issuer', 'Tanda tangan dibuat kunci selain issuer yang diklaim', 'PROVE_FAILED', ['threshold']],
  ['signature-malformed', 'issuer', 'String tanda tangan rusak', 'PROVE_FAILED', ['threshold']],
  ['issuer-unregistered', 'issuer', 'Issuer yang tidak pernah didaftarkan', 'ISSUER_NOT_REGISTERED'],
  [
    'holder-without-key',
    'holder',
    'Salinan kredensial dipresentasikan dengan kunci penyerang',
    'PROVE_FAILED',
    ['threshold', 'issuer'],
  ],
  ['holder-secret-guessed', 'holder', 'Kunci publik dipakai seolah kunci privat', 'PROVE_FAILED', ['threshold', 'issuer']],
  [
    'holder-secret-out-of-field',
    'holder',
    'Rahasia benar di atas orde field (secret + r)',
    'PROVE_FAILED',
    ['threshold', 'issuer'],
  ],
  ['replay-same-proof', 'replay', 'Proof yang sudah diterima dipresentasikan lagi', 'CHALLENGE_ALREADY_USED'],
  [
    'replay-relabelled-challenge',
    'replay',
    'Proof bekas dilabeli ulang ke challenge baru',
    'PROOF_INVALID',
    WITHOUT_REPLAY_BINDING,
  ],
  [
    'relay-to-other-verifier',
    'replay',
    'Proof verifier A dilabeli ulang untuk verifier B',
    'PROOF_INVALID',
    WITHOUT_REPLAY_BINDING,
  ],
  ['wrong-verifier', 'replay', 'Proof verifier A diserahkan ke verifier B tanpa diubah', 'CHALLENGE_VERIFIER_MISMATCH'],
  ['challenge-expired', 'replay', 'Proof diserahkan setelah challenge kedaluwarsa', 'CHALLENGE_EXPIRED'],
  ['challenge-unknown', 'replay', 'Challenge yang tidak pernah diterbitkan verifier', 'CHALLENGE_UNKNOWN'],
  ['payload-not-json', 'malformed', 'Payload proof bukan JSON', 'PROOF_INVALID'],
  ['payload-bad-shape', 'malformed', 'Struktur payload proof salah', 'PROOF_INVALID'],
  ['proof-bytes-tampered', 'malformed', 'Titik pi_a pada proof diubah', 'PROOF_INVALID'],
  ['signals-truncated', 'malformed', 'Public signal terakhir dihapus dari payload', 'PROOF_INVALID'],
  ['signals-non-decimal', 'malformed', 'Public signal bukan string desimal', 'PROOF_INVALID'],
  ['signals-out-of-field', 'malformed', 'Public signal terakhir di atas orde field (s + r)', 'PROOF_INVALID'],
  [
    'claims-challenge-out-of-field',
    'malformed',
    'Challenge pada klaim tidak muat di field',
    'PROOF_INVALID',
    WITHOUT_REPLAY_BINDING,
  ],
];

export const MOCK_SCENARIOS: readonly Scenario[] = [...HONEST_ROWS.map(honest), ...ATTACK_ROWS.map(attack)];
