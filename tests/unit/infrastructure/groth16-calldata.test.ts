import { describe, expect, it } from 'vitest';
import {
  FULL_PUBLIC_SIGNAL_COUNT,
  toVerifyCredentialArgs,
} from '../../../src/infrastructure/index.js';
import type { PayloadContent } from '../../../src/infrastructure/proof-system/proof-payload.js';

const content = (publicSignals: string[]): PayloadContent => ({
  proof: {
    protocol: 'groth16',
    curve: 'bn128',
    pi_a: ['1', '2', '1'],
    pi_b: [
      ['3', '4'],
      ['5', '6'],
      ['1', '0'],
    ],
    pi_c: ['7', '8', '1'],
  },
  publicSignals,
});

describe('groth16 calldata mapping', () => {
  it('swaps the G2 coordinate pairs and drops the projective z coordinates', () => {
    const args = toVerifyCredentialArgs(content(['10', '300', '12', '13']));

    expect(args.pA).toEqual([1n, 2n]);
    expect(args.pB).toEqual([
      [4n, 3n],
      [6n, 5n],
    ]);
    expect(args.pC).toEqual([7n, 8n]);
    expect(args.pubSignals).toEqual([10n, 300n, 12n, 13n]);
  });

  it('keeps the public signal order issuerKeyHash, threshold, challenge, verifierId', () => {
    expect(FULL_PUBLIC_SIGNAL_COUNT).toBe(4);
    expect(toVerifyCredentialArgs(content(['1', '2', '3', '4'])).pubSignals).toEqual([
      1n,
      2n,
      3n,
      4n,
    ]);
  });

  it('rejects a payload with the wrong number of public signals', () => {
    expect(() => toVerifyCredentialArgs(content(['1', '2', '3']))).toThrow(TypeError);
    expect(() => toVerifyCredentialArgs(content(['1', '2', '3', '4', '5']))).toThrow(TypeError);
  });
});
