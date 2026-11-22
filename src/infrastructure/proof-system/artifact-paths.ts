import { join, resolve } from 'node:path';

/** Repository root, resolved from this file (src/infrastructure/proof-system/). */
export const REPOSITORY_ROOT = resolve(import.meta.dirname, '../../..');

export const DEFAULT_ARTIFACTS_DIR = join(REPOSITORY_ROOT, 'circuits', 'artifacts');

/** Where a circuit variant's build output lives. Mirrors what `scripts/zk-setup.ts` writes. */
export interface CircuitArtifactPaths {
  readonly directory: string;
  readonly r1cs: string;
  readonly wasm: string;
  readonly zkey: string;
  readonly verificationKey: string;
  readonly solidityVerifier: string;
  /** Hash of the circuit sources the artifacts were built from (staleness check). */
  readonly sourceHash: string;
}

export const circuitArtifactPaths = (variant: string, artifactsDir: string = DEFAULT_ARTIFACTS_DIR): CircuitArtifactPaths => {
  const directory = join(artifactsDir, variant);
  return {
    directory,
    r1cs: join(directory, `${variant}.r1cs`),
    wasm: join(directory, `${variant}_js`, `${variant}.wasm`),
    zkey: join(directory, `${variant}.zkey`),
    verificationKey: join(directory, 'verification_key.json'),
    solidityVerifier: join(directory, 'verifier.sol'),
    sourceHash: join(directory, 'source.sha256'),
  };
};

/** Powers-of-tau files are circuit independent, so they are shared between variants. */
export const ptauPath = (power: number, artifactsDir: string = DEFAULT_ARTIFACTS_DIR): string =>
  join(artifactsDir, 'ptau', `pot${power}_final.ptau`);
