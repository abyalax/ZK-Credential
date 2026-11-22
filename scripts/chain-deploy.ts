/**
 * Deploys IssuerRegistry, Groth16Verifier and CredentialVerifier to the local node.
 * Prerequisites: `pnpm chain:node` running, and `pnpm setup:zk && pnpm chain:sync && pnpm chain:build`.
 *
 * Usage: pnpm chain:deploy
 * Env:   CHAIN_RPC_URL (default http://127.0.0.1:8545)
 *        REGISTRY_OWNER_PRIVATE_KEY (default: Hardhat dev account #0, local use only)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Hex } from 'viem';
import {
  createLocalPublicClient,
  createLocalWalletClient,
  DEFAULT_LOCAL_RPC_URL,
  deployCredentialVerifierStack,
  HARDHAT_DEV_PRIVATE_KEY,
} from '../src/infrastructure/chain/index.js';
import { REPOSITORY_ROOT } from '../src/infrastructure/proof-system/artifact-paths.js';

const main = async (): Promise<void> => {
  const rpcUrl = process.env.CHAIN_RPC_URL || DEFAULT_LOCAL_RPC_URL;
  const ownerKey = (process.env.REGISTRY_OWNER_PRIVATE_KEY || HARDHAT_DEV_PRIVATE_KEY) as Hex;

  const deployed = await deployCredentialVerifierStack({
    publicClient: createLocalPublicClient(rpcUrl),
    walletClient: createLocalWalletClient(ownerKey, rpcUrl),
  });

  const directory = join(REPOSITORY_ROOT, 'contracts', 'deployments');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'localhost.json'), `${JSON.stringify(deployed, null, 2)}\n`);

  process.stdout.write(
    [
      'Deployed. Add these to .env:',
      `CHAIN_RPC_URL=${rpcUrl}`,
      `ISSUER_REGISTRY_ADDRESS=${deployed.issuerRegistry}`,
      `CREDENTIAL_VERIFIER_ADDRESS=${deployed.credentialVerifier}`,
      '',
    ].join('\n'),
  );
};

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
