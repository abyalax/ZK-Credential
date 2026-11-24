/** Mirrors `experiments/configurations` (P6): baseline A, ablation ladder B1-B4, SD-JWT baseline. */
export const CONFIGURATION_IDS = ['A', 'SD', 'B1', 'B2', 'B3', 'B4'] as const;
export type ConfigurationId = (typeof CONFIGURATION_IDS)[number];

/** Circuit variants of the ablation ladder (`circuits/src/variants/`). */
export type VariantName = 'threshold' | 'issuer' | 'holder' | 'full';

export const ABLATION_IDS = ['B1', 'B2', 'B3', 'B4'] as const satisfies readonly ConfigurationId[];
export type AblationId = (typeof ABLATION_IDS)[number];

export interface Guarantees {
  readonly issuerAuthenticity: boolean;
  readonly holderBinding: boolean;
  readonly replayProtection: boolean;
}

export interface Configuration {
  readonly id: ConfigurationId;
  readonly label: string;
  readonly circuit: VariantName | undefined;
  readonly guarantees: Guarantees;
}

const guarantees = (issuerAuthenticity: boolean, holderBinding: boolean, replayProtection: boolean): Guarantees => ({
  issuerAuthenticity,
  holderBinding,
  replayProtection,
});

export const CONFIGURATIONS: readonly Configuration[] = [
  { id: 'A', label: 'Baseline: cek tanda tangan, tanpa ZKP', circuit: undefined, guarantees: guarantees(true, false, false) },
  {
    id: 'SD',
    label: 'Baseline: SD-JWT dengan key binding, tanpa ZKP',
    circuit: undefined,
    guarantees: guarantees(true, true, true),
  },
  { id: 'B1', label: 'ZKP: threshold saja', circuit: 'threshold', guarantees: guarantees(false, false, false) },
  { id: 'B2', label: 'ZKP: threshold + issuer', circuit: 'issuer', guarantees: guarantees(true, false, false) },
  { id: 'B3', label: 'ZKP: threshold + issuer + holder', circuit: 'holder', guarantees: guarantees(true, true, false) },
  {
    id: 'B4',
    label: 'ZKP: threshold + issuer + holder + replay (diusulkan)',
    circuit: 'full',
    guarantees: guarantees(true, true, true),
  },
];

export const findConfiguration = (id: ConfigurationId): Configuration => {
  const found = CONFIGURATIONS.find((configuration) => configuration.id === id);
  if (!found) throw new Error(`Unknown configuration "${id}"`);
  return found;
};

export const usesCircuit = (id: ConfigurationId): boolean => findConfiguration(id).circuit !== undefined;
