import type { Address, PublicClient, WalletClient } from 'viem';
import type { IssuerRegistry } from '../../application/index.js';
import type { Issuer } from '../../domain/index.js';
import { issuerKeyHash } from '../cryptography/issuer-key-hash.js';

const issuerRegistryAbi = [
  {
    type: 'function',
    name: 'addIssuer',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'publicKeyHash', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isTrusted',
    stateMutability: 'view',
    inputs: [{ name: 'publicKeyHash', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export interface OnChainIssuerRegistry extends IssuerRegistry {
  /** Registers a key with the configured owner account and waits for transaction confirmation. */
  addIssuer: (publicKey: Issuer['publicKey'] | string) => Promise<void>;
  isTrusted: (publicKey: Issuer['publicKey'] | string) => Promise<boolean>;
}

export interface OnChainIssuerRegistryOptions {
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient;
  readonly contractAddress: Address;
  /** Domain metadata for keys this verifier recognizes; trust is always read from chain. */
  readonly issuers: readonly Issuer[];
}

/**
 * Maps trusted on-chain keys back to the domain's issuer IDs and display names. The contract keys
 * trust by `Poseidon(Ax, Ay)`, the same value the circuit exposes as `issuerKeyHash`.
 */
export const createOnChainIssuerRegistry = ({
  publicClient,
  walletClient,
  contractAddress,
  issuers,
}: OnChainIssuerRegistryOptions): OnChainIssuerRegistry => {
  const isTrusted = async (publicKey: Issuer['publicKey'] | string) =>
    publicClient.readContract({
      address: contractAddress,
      abi: issuerRegistryAbi,
      functionName: 'isTrusted',
      args: [await issuerKeyHash(publicKey)],
    });

  return {
    isTrusted,
    async list() {
      const trusted = await Promise.all(
        issuers.map(async (issuer) => ((await isTrusted(issuer.publicKey)) ? issuer : undefined)),
      );
      return trusted.filter((issuer): issuer is Issuer => issuer !== undefined);
    },
    async addIssuer(publicKey) {
      const account = walletClient.account;
      if (!account) throw new TypeError('Issuer registry wallet client requires an account');
      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: issuerRegistryAbi,
        functionName: 'addIssuer',
        args: [await issuerKeyHash(publicKey)],
        account,
        chain: walletClient.chain ?? null,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('Issuer registration transaction reverted');
    },
  };
};
