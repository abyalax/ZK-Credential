import type { Brand } from '../../shared/index.js';

/**
 * Holder-key binding: a credential embeds the holder's public key, and the circuit requires
 * the prover to know the matching private key. The binding itself is enforced inside the
 * circuit, so the domain only models the key material.
 */
export type HolderPublicKey = Brand<string, 'HolderPublicKey'>;
export type HolderPrivateKey = Brand<string, 'HolderPrivateKey'>;

/** Both halves of a holder key. The private half must never leave the process that holds it. */
export interface HolderKeys {
  readonly publicKey: HolderPublicKey;
  readonly privateKey: HolderPrivateKey;
}

export const asHolderPublicKey = (value: string): HolderPublicKey => value as HolderPublicKey;
export const asHolderPrivateKey = (value: string): HolderPrivateKey => value as HolderPrivateKey;
