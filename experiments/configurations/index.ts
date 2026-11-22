import type { VariantName } from '../scenarios/types.js';

/** Configurations of the P6 evaluation: baseline A and the B ablation ladder. */
export const CONFIGURATION_IDS = ['A', 'B1', 'B2', 'B3', 'B4'];
export type ConfigurationId = (typeof CONFIGURATION_IDS)[number];

export interface Configuration {
  readonly id: ConfigurationId;
  readonly label: string;
  /** Circuit variant under `circuits/src/variants/`; `undefined` when no ZKP is used. */
  readonly circuit: VariantName | undefined;
  /** What the verifier learns about the credential. */
  readonly disclosure: 'full-credential' | 'gpa-threshold-only';
  readonly guarantees: {
    readonly issuerAuthenticity: boolean;
    readonly holderBinding: boolean;
    readonly replayProtection: boolean;
  };
}

export const CONFIGURATIONS: readonly Configuration[] = [
  {
    id: 'A',
    label: 'Baseline: signature check, no ZKP',
    circuit: undefined,
    disclosure: 'full-credential',
    guarantees: { issuerAuthenticity: true, holderBinding: false, replayProtection: false },
  },
  {
    id: 'B1',
    label: 'ZKP: threshold only',
    circuit: 'threshold',
    disclosure: 'gpa-threshold-only',
    guarantees: { issuerAuthenticity: false, holderBinding: false, replayProtection: false },
  },
  {
    id: 'B2',
    label: 'ZKP: threshold + issuer',
    circuit: 'issuer',
    disclosure: 'gpa-threshold-only',
    guarantees: { issuerAuthenticity: true, holderBinding: false, replayProtection: false },
  },
  {
    id: 'B3',
    label: 'ZKP: threshold + issuer + holder',
    circuit: 'holder',
    disclosure: 'gpa-threshold-only',
    guarantees: { issuerAuthenticity: true, holderBinding: true, replayProtection: false },
  },
  {
    id: 'B4',
    label: 'ZKP: threshold + issuer + holder + replay (proposed)',
    circuit: 'full',
    disclosure: 'gpa-threshold-only',
    guarantees: { issuerAuthenticity: true, holderBinding: true, replayProtection: true },
  },
];

export const findConfiguration = (id: string): Configuration => {
  const found = CONFIGURATIONS.find((configuration) => configuration.id === id);
  if (!found)
    throw new Error(`Unknown configuration "${id}". Available: ${CONFIGURATION_IDS.join(', ')}`);
  return found;
};
