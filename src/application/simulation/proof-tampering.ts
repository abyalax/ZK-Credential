import type { Proof } from '../../domain/index.js';
import { asProofPayload } from '../../domain/index.js';

/** BN254 scalar field order. A test pins it to `BN254_FIELD_ORDER` of the cryptography adapter. */
export const FIELD_ORDER = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

interface PayloadShape {
  proof: { pi_a: string[] } & Record<string, unknown>;
  publicSignals: string[];
}

const withPayload = (proof: Proof, payload: string): Proof => ({ ...proof, payload: asProofPayload(payload) });

/** Rewrites the serialized payload; the public claims of the proof stay as they were. */
const editPayload = (proof: Proof, edit: (payload: PayloadShape) => void): Proof => {
  const payload = JSON.parse(proof.payload) as PayloadShape;
  edit(payload);
  return withPayload(proof, JSON.stringify(payload));
};

const lastIndex = (payload: PayloadShape): number => payload.publicSignals.length - 1;

export const payloadNotJson = (proof: Proof): Proof => withPayload(proof, 'not-json');

export const payloadBadShape = (proof: Proof): Proof => withPayload(proof, JSON.stringify({ proof: {}, publicSignals: [] }));

export const proofBytesTampered = (proof: Proof): Proof =>
  editPayload(proof, (payload) => {
    payload.proof.pi_a[0] = '1';
  });

export const signalsTruncated = (proof: Proof): Proof =>
  editPayload(proof, (payload) => {
    payload.publicSignals.pop();
  });

export const signalsNonDecimal = (proof: Proof): Proof =>
  editPayload(proof, (payload) => {
    payload.publicSignals[0] = '0x10';
  });

export const signalsOutOfField = (proof: Proof): Proof =>
  editPayload(proof, (payload) => {
    const index = lastIndex(payload);
    payload.publicSignals[index] = (BigInt(payload.publicSignals[index] ?? '0') + FIELD_ORDER).toString();
  });
