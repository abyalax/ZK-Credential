import type { Groth16Proof } from 'snarkjs';

/** What `Proof.payload` holds: the snarkjs proof and the circuit's public signals. */
export interface PayloadContent {
  readonly proof: Groth16Proof;
  readonly publicSignals: string[];
}

const DECIMAL = /^\d+$/;

const isDecimalArray = (value: unknown, length?: number): value is string[] =>
  Array.isArray(value) &&
  (length === undefined || value.length === length) &&
  value.every((item) => typeof item === 'string' && DECIMAL.test(item));

/** Strict shape check. Payloads come from untrusted holders, so nothing malformed reaches snarkjs. */
export const parsePayload = (payload: string): PayloadContent | undefined => {
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

export const sameSignals = (expected: readonly string[], actual: readonly string[]): boolean =>
  expected.length === actual.length && expected.every((value, index) => value === actual[index]);
