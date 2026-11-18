import type { Brand } from '../../shared/index.js';

/**
 * Holder-key binding: a credential embeds the holder's public key, and the circuit requires
 * the prover to know the matching secret key. The binding itself is enforced inside the
 * circuit, so the domain only models the key material.
 */
export type HolderPublicKey = Brand<string, 'HolderPublicKey'>;
export type HolderSecretKey = Brand<string, 'HolderSecretKey'>;

export const asHolderPublicKey = (value: string): HolderPublicKey => value as HolderPublicKey;
export const asHolderSecretKey = (value: string): HolderSecretKey => value as HolderSecretKey;
