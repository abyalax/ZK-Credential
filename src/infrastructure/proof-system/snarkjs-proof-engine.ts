import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { Groth16Proof } from 'snarkjs';
import type { IssuerRegistry, ProofEngine } from '../../application/index.js';
import type { Proof, PublicSignals } from '../../domain/index.js';
import { asProofPayload } from '../../domain/index.js';
import { InfrastructureError } from '../../shared/index.js';
import type { CircuitArtifactPaths } from './artifact-paths.js';
import { circuitArtifactPaths } from './artifact-paths.js';
import type { CircuitVariant } from './circuit-variants.js';
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
  close(): Promise<void>;
}

/** What `Proof.payload` holds: the snarkjs proof and the circuit's public signals. */
interface PayloadContent {
  readonly proof: Groth16Proof;
  readonly publicSignals: string[];
}

const DECIMAL = /^\d+$/;

const isDecimalArray = (value: unknown, length?: number): value is string[] =>
  Array.isArray(value) &&
  (length === undefined || value.length === length) &&
  value.every((item) => typeof item === 'string' && DECIMAL.test(item));

/** Strict shape check. Payloads come from untrusted holders, so nothing malformed reaches snarkjs. */
const parsePayload = (payload: string): PayloadContent | undefined => {
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return;
  }
  if (typeof raw !== 'object' || raw === null) return;
  const { proof, publicSignals } = raw as Record<string, unknown>;
  if (typeof proof !== 'object' || proof === null) return;
  const { pi_a, pi_b, pi_c, protocol, curve } = proof as Record<string, unknown>;

  if (protocol !== 'groth16' || curve !== 'bn128') return;
  if (!(isDecimalArray(pi_a, 3) && isDecimalArray(pi_c, 3))) return;
  if (!Array.isArray(pi_b) || pi_b.length !== 3) return;
  if (!pi_b.every((pair) => isDecimalArray(pair, 2))) return;
  if (!isDecimalArray(publicSignals)) return;

  return { proof: { pi_a, pi_b, pi_c, protocol, curve }, publicSignals };
};

const sameSignals = (expected: readonly string[], actual: readonly string[]): boolean =>
  expected.length === actual.length && expected.every((value, index) => value === actual[index]);

const assertArtifactsExist = (paths: CircuitArtifactPaths, variant: string): void => {
  const missing = [paths.wasm, paths.zkey, paths.verificationKey].filter(
    (file) => !existsSync(file),
  );
  if (missing.length > 0) {
    throw new InfrastructureError(
      `Circuit artifacts for "${variant}" are missing (${missing.join(', ')}). Run \`pnpm zk:setup\` first.`,
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

const generateProof = async ({
  snarkjs,
  variant,
  issuers,
  paths,
  input,
}: GenerateProofParams): Promise<Proof> => {
  const { credential } = input.signedCredential;
  const issuer = (await issuers.list()).find((candidate) => candidate.id === credential.issuerId);
  if (!issuer)
    throw new InfrastructureError(`Issuer "${credential.issuerId}" is not in the issuer registry`);

  let generated: Awaited<ReturnType<typeof snarkjs.groth16.fullProve>>;
  try {
    generated = await snarkjs.groth16.fullProve(
      variant.circuitInputs(input, issuer),
      paths.wasm,
      paths.zkey,
    );
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
  if (!sameSignals(await variant.expectedPublicSignals(proof.publicSignals), content.publicSignals))
    return false;
  try {
    return await snarkjs.groth16.verify(verificationKey, content.publicSignals, content.proof);
  } catch {
    return false;
  }
};

/**
 * Groth16 `ProofEngine` backed by snarkjs. Proving needs the variant's compiled circuit and
 * proving key, verifying needs its verification key; all come from `pnpm zk:setup`.
 */
export const createSnarkjsProofEngine = async (
  options: SnarkjsProofEngineOptions,
): Promise<SnarkjsProofEngine> => {
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
