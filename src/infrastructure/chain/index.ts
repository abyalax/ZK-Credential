export type { ContractArtifact } from './contract-artifacts.js';
export { CONTRACT_ARTIFACTS_DIR, loadContractArtifact } from './contract-artifacts.js';
export type { DeployClients, DeployedContracts } from './deploy.js';
export { deployCredentialVerifierStack } from './deploy.js';
export type { VerifyCredentialArgs } from './groth16-calldata.js';
export { FULL_PUBLIC_SIGNAL_COUNT, toVerifyCredentialArgs } from './groth16-calldata.js';
export {
  createLocalPublicClient,
  createLocalWalletClient,
  DEFAULT_LOCAL_RPC_URL,
  HARDHAT_DEV_PRIVATE_KEY,
} from './local-chain.js';
export type { OnChainProofEngineOptions } from './on-chain-proof-engine.js';
export { createOnChainProofEngine } from './on-chain-proof-engine.js';
