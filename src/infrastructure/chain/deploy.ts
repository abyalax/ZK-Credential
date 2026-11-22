import type { Account, Address, Chain, PublicClient, Transport, WalletClient } from 'viem';
import { InfrastructureError } from '../../shared/index.js';
import { loadContractArtifact } from './contract-artifacts.js';

export interface DeployedContracts {
  readonly issuerRegistry: Address;
  readonly groth16Verifier: Address;
  readonly credentialVerifier: Address;
}

export interface DeployClients {
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient<Transport, Chain | undefined, Account>;
  /** Directory with Hardhat artifacts; defaults to `contracts/artifacts`. */
  readonly artifactsDir?: string;
}

const deploy = async (
  { publicClient, walletClient, artifactsDir }: DeployClients,
  name: string,
  args: readonly unknown[] = [],
): Promise<Address> => {
  const { abi, bytecode } = await loadContractArtifact(name, artifactsDir);
  const hash = await walletClient.deployContract({
    abi,
    bytecode,
    args,
    account: walletClient.account,
    chain: walletClient.chain ?? null,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success' || !receipt.contractAddress) throw new InfrastructureError(`Deployment of ${name} failed`);
  return receipt.contractAddress;
};

/**
 * Deploys the registry (owned by the wallet account), the generated Groth16 verifier, and the
 * `CredentialVerifier` that ties them together.
 */
export const deployCredentialVerifierStack = async (clients: DeployClients): Promise<DeployedContracts> => {
  const issuerRegistry = await deploy(clients, 'IssuerRegistry');
  const groth16Verifier = await deploy(clients, 'Groth16Verifier');
  const credentialVerifier = await deploy(clients, 'CredentialVerifier', [issuerRegistry, groth16Verifier]);
  return { issuerRegistry, groth16Verifier, credentialVerifier };
};
