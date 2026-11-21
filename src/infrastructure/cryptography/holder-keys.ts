import { randomBytes } from 'node:crypto';
import { buildPoseidon } from 'circomlibjs';
import type { HolderPrivateKey, HolderPublicKey } from '../../domain/index.js';
import { asHolderPrivateKey, asHolderPublicKey } from '../../domain/index.js';
import { parseFieldElement } from './credential-encoding.js';

/** 31 bytes = 248 bits: uniform and always below the BN254 scalar field, so no modular bias. */
const SECRET_KEY_BYTES = 31;

let poseidon: ReturnType<typeof buildPoseidon> | undefined;

export interface HolderKeyPair {
  readonly publicKey: HolderPublicKey;
  /**
   * Defined as a non-enumerable property, so `JSON.stringify`, spreading and `console.log` of the
   * pair leave the secret out. Read it explicitly: `pair.privateKey`.
   */
  readonly privateKey: HolderPrivateKey;
}

/** `holderPublicKey = Poseidon(holderPrivateKey)`, as a decimal string (see docs/protocol/protocol.md). */
export const deriveHolderPublicKey = async (
  privateKey: HolderPrivateKey,
): Promise<HolderPublicKey> => {
  poseidon ??= buildPoseidon();
  const hash = await poseidon;
  const secret = parseFieldElement(privateKey, 'Holder private key');
  return asHolderPublicKey(hash.F.toObject(hash([secret])).toString());
};

/** `random` is injectable for deterministic tests; production uses the OS CSPRNG. */
export const generateHolderKeyPair = async (
  random: (size: number) => Uint8Array = randomBytes,
): Promise<HolderKeyPair> => {
  const secretHex = Buffer.from(random(SECRET_KEY_BYTES)).toString('hex');
  const privateKey = asHolderPrivateKey(BigInt(`0x${secretHex}`).toString());
  const pair = { publicKey: await deriveHolderPublicKey(privateKey) };
  Object.defineProperty(pair, 'privateKey', { value: privateKey, enumerable: false });
  return pair as HolderKeyPair;
};
