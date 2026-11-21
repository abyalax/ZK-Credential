import {
  type Account,
  type Chain,
  createPublicClient,
  createWalletClient,
  type Hex,
  http,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat } from 'viem/chains';

/**
 * Hardhat's well-known dev account #0. It is public and only valid on a local Hardhat network,
 * so it is safe as a default for `chain:deploy` and must never hold real funds.
 */
export const HARDHAT_DEV_PRIVATE_KEY: Hex =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

export const DEFAULT_LOCAL_RPC_URL = 'http://127.0.0.1:8545';

/** Public client for a local JSON-RPC node (`pnpm chain:node`). */
export const createLocalPublicClient = (rpcUrl: string = DEFAULT_LOCAL_RPC_URL): PublicClient =>
  createPublicClient({ chain: hardhat, transport: http(rpcUrl) });

/** Wallet client signing locally with `privateKey`, sending to a local JSON-RPC node. */
export const createLocalWalletClient = (
  privateKey: Hex,
  rpcUrl: string = DEFAULT_LOCAL_RPC_URL,
): WalletClient<Transport, Chain, Account> =>
  createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: hardhat,
    transport: http(rpcUrl),
  });
