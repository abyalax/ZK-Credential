import { randomBytes } from 'node:crypto';
import { buildEddsa, buildPoseidon } from 'circomlibjs';
import type { CredentialSigner } from '../../application/index.js';
import type { Credential, IssuerPublicKey, IssuerSignature } from '../../domain/index.js';
import { asIssuerPublicKey, asIssuerSignature } from '../../domain/index.js';
import { credentialCommitmentInputs } from './credential-encoding.js';

const PRIVATE_KEY_BYTES = 32;
const HEX_KEY = /^(?:0x)?[0-9a-fA-F]{64}$/;

const serializePoint = (
  point: readonly [Uint8Array, Uint8Array],
  eddsa: Awaited<ReturnType<typeof buildEddsa>>,
): IssuerPublicKey =>
  asIssuerPublicKey(`${eddsa.F.toObject(point[0])}:${eddsa.F.toObject(point[1])}`);

/** Creates an EdDSA-Poseidon signer. Keep `privateKeyHex` in a secret store, never in source control. */
export const createEddsaCredentialSigner = async (privateKeyHex: string) => {
  if (!HEX_KEY.test(privateKeyHex))
    throw new TypeError('Issuer private key must be exactly 32 hex bytes');
  const privateKey = Buffer.from(privateKeyHex.replace(/^0x/i, ''), 'hex');
  const [eddsa, poseidon] = await Promise.all([buildEddsa(), buildPoseidon()]);
  const point = eddsa.prv2pub(privateKey);

  const signer: CredentialSigner & { readonly publicKey: IssuerPublicKey } = {
    publicKey: serializePoint(point, eddsa),
    async sign(credential: Credential): Promise<IssuerSignature> {
      const commitment = poseidon(credentialCommitmentInputs(credential));
      const signature = eddsa.signPoseidon(privateKey, commitment);
      return asIssuerSignature(
        JSON.stringify({
          R8x: eddsa.F.toObject(signature.R8[0]).toString(),
          R8y: eddsa.F.toObject(signature.R8[1]).toString(),
          S: signature.S.toString(),
        }),
      );
    },
  };
  return signer;
};

/** Generates a fresh 32-byte BabyJubJub private key for provisioning an issuer. */
export const generateIssuerPrivateKey = (): string =>
  randomBytes(PRIVATE_KEY_BYTES).toString('hex');

/** Parses the canonical decimal `Ax:Ay` key representation used by issuers and circuit inputs. */
export const parseIssuerPublicKey = (value: string): readonly [bigint, bigint] => {
  const match = /^(\d+):(\d+)$/.exec(value);
  const [, ax, ay] = match ?? [];

  if (ax === undefined || ay === undefined)
    throw new TypeError('Issuer public key must use decimal Ax:Ay encoding');

  return [BigInt(ax), BigInt(ay)];
};

/** Parses signatures produced by this adapter; malformed signatures fail before witness creation. */
export const parseIssuerSignature = (
  value: string,
): { readonly R8x: bigint; readonly R8y: bigint; readonly S: bigint } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new TypeError('Issuer signature is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null)
    throw new TypeError('Issuer signature has invalid shape');
  const { R8x, R8y, S } = parsed as Record<string, unknown>;
  if (![R8x, R8y, S].every((part) => typeof part === 'string' && /^\d+$/.test(part))) {
    throw new TypeError('Issuer signature must contain decimal R8x, R8y and S values');
  }
  return { R8x: BigInt(R8x as string), R8y: BigInt(R8y as string), S: BigInt(S as string) };
};
