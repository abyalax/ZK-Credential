import { join } from 'node:path';
import { createHardhatRuntimeEnvironment } from 'hardhat/hre';
import {
  type Account,
  type Address,
  type Chain,
  createPublicClient,
  createWalletClient,
  custom,
  type EIP1193RequestFn,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem';
import { hardhat } from 'viem/chains';
import hardhatConfig from '../../../contracts/hardhat.config.js';
import { REPOSITORY_ROOT } from '../../../src/infrastructure/index.js';

export interface LocalChain {
  readonly publicClient: PublicClient;
  readonly accounts: readonly Address[];
  /** Wallet client acting as one of the unlocked Hardhat accounts. */
  readonly walletFor: (account: Address) => WalletClient<Transport, Chain, Account>;
}

/**
 * Starts the in-process simulated Hardhat network (no node process, no network access). Each call
 * gives a fresh chain, so tests do not share state.
 */
export const startLocalChain = async (): Promise<LocalChain> => {
  const hre = await createHardhatRuntimeEnvironment(
    hardhatConfig,
    { config: join(REPOSITORY_ROOT, 'contracts', 'hardhat.config.ts') },
    REPOSITORY_ROOT,
  );
  const { provider } = await hre.network.connect('hardhat');
  const transport = custom(provider as unknown as { request: EIP1193RequestFn });
  const publicClient = createPublicClient({ chain: hardhat, transport });
  const accounts = await createWalletClient({ chain: hardhat, transport }).getAddresses();
  return {
    publicClient,
    accounts,
    walletFor: (account) => createWalletClient({ account, chain: hardhat, transport }),
  };
};
