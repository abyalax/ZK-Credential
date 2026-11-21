import { buildPoseidon } from 'circomlibjs';
import { parseIssuerPublicKey } from './eddsa-credential-signer.js';

/**
 * `Poseidon(Ax, Ay)` of an issuer's canonical `Ax:Ay` public key: the `issuerKeyHash` public
 * signal of the circuit, and the key under which the on-chain `IssuerRegistry` records trust.
 */
export const issuerKeyHash = async (publicKey: string): Promise<bigint> => {
  const poseidon = await buildPoseidon();
  const [Ax, Ay] = parseIssuerPublicKey(publicKey);
  return BigInt(poseidon.F.toObject(poseidon([Ax, Ay])));
};
