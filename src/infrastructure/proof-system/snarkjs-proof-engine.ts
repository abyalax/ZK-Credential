import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { IssuerRegistry, ProofEngine } from '../../application/index.js';
import type { Proof, PublicSignals } from '../../domain/index.js';
import { asProofPayload } from '../../domain/index.js';
import { InfrastructureError } from '../../shared/index.js';
import type { CircuitArtifactPaths } from './artifact-paths.js';
import { circuitArtifactPaths } from './artifact-paths.js';
import type { CircuitVariant } from './circuit-variants.js';
import { type PayloadContent, parsePayload, sameSignals } from './proof-payload.js';
import { loadSnarkjs, terminateSnarkjs } from './snarkjs-runtime.js';

export interface SnarkjsProofEngineOptions {
  readonly variant: CircuitVariant;
  /** Used to put the issuer's public key into the proof's claims. */
  readonly issuers: IssuerRegistry;
  /** Defaults to `circuits/artifacts`. */
  readonly artifactsDir?: string;
}

export interface SnarkjsProofEngine extends ProofEngine {
  /** Stops snarkjs' worker threads so the process can exit. */
  close: () => Promise<void>;
}

const assertArtifactsExist = (paths: CircuitArtifactPaths, variant: string): void => {
  const missing = [paths.wasm, paths.zkey, paths.verificationKey].filter((file) => !existsSync(file));
  if (missing.length > 0) {
    throw new InfrastructureError(
      `Circuit artifacts for "${variant}" are missing (${missing.join(', ')}). Run \`pnpm setup:zk\` first.`,
    );
  }
};

interface GenerateProofParams {
  readonly snarkjs: Awaited<ReturnType<typeof loadSnarkjs>>;
  readonly variant: CircuitVariant;
  readonly issuers: IssuerRegistry;
  readonly paths: CircuitArtifactPaths;
  readonly input: Parameters<ProofEngine['generate']>[0];
}

const generateProof = async ({ snarkjs, variant, issuers, paths, input }: GenerateProofParams): Promise<Proof> => {
  const { credential } = input.signedCredential;
  const issuer = (await issuers.list()).find((candidate) => candidate.id === credential.issuerId);
  if (!issuer) throw new InfrastructureError(`Issuer "${credential.issuerId}" is not in the issuer registry`);

  let generated: Awaited<ReturnType<typeof snarkjs.groth16.fullProve>>;
  try {
    generated = await snarkjs.groth16.fullProve(variant.circuitInputs(input, issuer), paths.wasm, paths.zkey);
  } catch (cause) {
    throw new InfrastructureError(`Proof generation failed for circuit "${variant.name}"`, {
      cause,
    });
  }

  const publicSignals: PublicSignals = {
    issuerPublicKey: issuer.publicKey,
    gpaThreshold: input.request.gpaThreshold,
    challenge: input.request.challenge,
    verifierId: input.request.verifierId,
  };
  const content: PayloadContent = {
    proof: generated.proof,
    publicSignals: generated.publicSignals,
  };
  return { protocol: 'groth16', payload: asProofPayload(JSON.stringify(content)), publicSignals };
};

const verifyProof = async (
  snarkjs: Awaited<ReturnType<typeof loadSnarkjs>>,
  variant: CircuitVariant,
  verificationKey: object,
  proof: Proof,
): Promise<boolean> => {
  if (proof.protocol !== 'groth16') return false;
  const content = parsePayload(proof.payload);
  if (!content) return false;
  // Claims come from an untrusted holder: one that cannot be encoded is simply an invalid proof.
  let expected: readonly string[];
  try {
    expected = await variant.expectedPublicSignals(proof.publicSignals);
  } catch {
    return false;
  }
  if (!sameSignals(expected, content.publicSignals)) return false;
  try {
    return await snarkjs.groth16.verify(verificationKey, content.publicSignals, content.proof);
  } catch {
    return false;
  }
};

/**
 * Groth16 `ProofEngine` backed by snarkjs. Proving needs the variant's compiled circuit and
 * proving key, verifying needs its verification key; all come from `pnpm setup:zk`.
 */
export const createSnarkjsProofEngine = async (options: SnarkjsProofEngineOptions): Promise<SnarkjsProofEngine> => {
  const { variant, issuers } = options;
  const paths = circuitArtifactPaths(variant.name, options.artifactsDir);
  assertArtifactsExist(paths, variant.name);

  const [snarkjs, verificationKey] = await Promise.all([
    loadSnarkjs(),
    readFile(paths.verificationKey, 'utf8').then((text) => JSON.parse(text) as object),
  ]);

  return {
    async generate(input) {
      return generateProof({ snarkjs, variant, issuers, paths, input });
    },
    async verify(proof) {
      return verifyProof(snarkjs, variant, verificationKey, proof);
    },
    close: terminateSnarkjs,
  };
};
