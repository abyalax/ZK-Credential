import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as snarkjs from 'snarkjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GPA_MAX } from '../../src/domain/index.js';
import { circuitArtifactPaths } from '../../src/infrastructure/proof-system/artifact-paths.js';
import { terminateSnarkjs } from '../../src/infrastructure/proof-system/snarkjs-runtime.js';

const paths = circuitArtifactPaths('threshold');

/** BN254 scalar field order: p - 1 is how the circuit sees "-1". */
const FIELD_ORDER = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'zk-credential-circuit-'));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
  await terminateSnarkjs();
});

/** Computes the witness; rejects when any constraint is violated. */
const witnessOf = async (gpa: bigint | number, gpaThreshold: bigint | number) => {
  const file = join(workDir, `witness-${Math.random().toString(36).slice(2)}.wtns`);
  await snarkjs.wtns.calculate({ gpa: gpa.toString(), gpaThreshold: gpaThreshold.toString() }, paths.wasm, file);
  return (await snarkjs.wtns.exportJson(file)) as bigint[];
};

describe('GpaThreshold circuit (variant "threshold")', () => {
  it('exposes only the threshold as a public signal', async () => {
    const info = await snarkjs.r1cs.info(paths.r1cs);
    expect(info.nPubInputs).toBe(1);
    expect(info.nOutputs).toBe(0);
  });

  it('accepts a GPA above the threshold and publishes the threshold', async () => {
    const witness = await witnessOf(375, 300);
    expect(witness[0]).toBe(1n);
    expect(witness[1]).toBe(300n);
  });

  it.each([
    ['equal to the threshold', 300, 300],
    ['the lowest possible GPA with a zero threshold', 0, 0],
    ['the highest possible GPA at the highest threshold', GPA_MAX, GPA_MAX],
  ])('accepts a GPA %s', async (_label, gpa, threshold) => {
    await expect(witnessOf(gpa, threshold)).resolves.toBeDefined();
  });

  it.each([
    ['just below the threshold', 299, 300],
    ['zero against a positive threshold', 0, 1],
  ])('rejects a GPA %s', async (_label, gpa, threshold) => {
    await expect(witnessOf(gpa, threshold)).rejects.toThrow();
  });

  describe('range checks (soundness of the comparison)', () => {
    it('rejects a GPA above the maximum even when it beats the threshold', async () => {
      await expect(witnessOf(GPA_MAX + 1, 0)).rejects.toThrow();
    });

    it('rejects a GPA that does not fit the comparison bit width', async () => {
      // 600 > 2^9 yet 600 vs 300 passes circomlib's comparator alone: only Num2Bits catches it.
      await expect(witnessOf(600, 300)).rejects.toThrow();
      await expect(witnessOf(512, 0)).rejects.toThrow();
      await expect(witnessOf(2n ** 200n, 0)).rejects.toThrow();
    });

    it('rejects a GPA that wraps around the field ("negative")', async () => {
      await expect(witnessOf(FIELD_ORDER - 1n, 0)).rejects.toThrow();
    });

    it('rejects a threshold above the maximum', async () => {
      await expect(witnessOf(GPA_MAX, GPA_MAX + 1)).rejects.toThrow();
    });

    it('rejects a threshold that wraps around the field', async () => {
      await expect(witnessOf(GPA_MAX, FIELD_ORDER - 1n)).rejects.toThrow();
    });
  });
});
