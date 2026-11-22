import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat } from 'viem/chains';
import type { ChallengeStore, CredentialRepository } from '../../application/index.js';
import { makeGenerateProof, makeIssueChallenge, makeIssueCredential, makeVerifyCredential } from '../../application/index.js';
import type { Issuer } from '../../domain/index.js';
import { asIssuerId } from '../../domain/index.js';
import {
  createEddsaCredentialSigner,
  createInMemoryChallengeStore,
  createInMemoryCredentialRepository,
  createOnChainIssuerRegistry,
  createOnChainProofEngine,
  createSnarkjsProofEngine,
  cryptoRandomness,
  fullVariant,
  systemClock,
} from '../../infrastructure/index.js';
import type { AppConfig } from './config.js';

/**
 * Composition root (P4.5): wires the real adapters to the use cases. Proofs are generated
 * off-chain with snarkjs and verified through `CredentialVerifier` on the local chain; the issuer
 * registry is read from chain; challenges and credentials stay in memory (hybrid enforcement).
 */
export interface ContainerOverrides {
  /** Persistent stores for the CLI; default to in-memory. */
  readonly credentials?: CredentialRepository;
  readonly challenges?: ChallengeStore;
  /** Injected chain clients (e.g. the in-process Hardhat network in e2e tests). */
  readonly publicClient?: PublicClient;
  readonly walletClient?: WalletClient;
}

export const createContainer = async (config: AppConfig, overrides: ContainerOverrides = {}) => {
  const { chain } = config;
  const publicClient = overrides.publicClient ?? createPublicClient({ chain: hardhat, transport: http(chain.rpcUrl) });
  const walletClient =
    overrides.walletClient ??
    createWalletClient({
      chain: hardhat,
      transport: http(chain.rpcUrl),
      ...(chain.registryOwnerPrivateKey ? { account: privateKeyToAccount(chain.registryOwnerPrivateKey) } : {}),
    });

  const signer = await createEddsaCredentialSigner(config.issuer.privateKey);
  const issuer: Issuer = {
    id: asIssuerId(config.issuer.id),
    name: config.issuer.name,
    publicKey: signer.publicKey,
  };

  const issuers = createOnChainIssuerRegistry({
    publicClient,
    walletClient,
    contractAddress: chain.issuerRegistryAddress,
    issuers: [issuer],
  });
  const snarkjsEngine = await createSnarkjsProofEngine({ variant: fullVariant, issuers });
  const proofEngine = createOnChainProofEngine({
    generator: snarkjsEngine,
    variant: fullVariant,
    publicClient,
    credentialVerifierAddress: chain.credentialVerifierAddress,
  });

  const clock = systemClock;
  const randomness = cryptoRandomness;
  const credentials = overrides.credentials ?? createInMemoryCredentialRepository();
  const challenges = overrides.challenges ?? createInMemoryChallengeStore();

  return {
    issuer,
    issuers,
    issueCredential: makeIssueCredential({ credentials, issuers, signer, clock, randomness }),
    issueChallenge: makeIssueChallenge({ challenges, clock, randomness }),
    generateProof: makeGenerateProof({ credentials, proofEngine }),
    verifyCredential: makeVerifyCredential({ challenges, issuers, proofEngine, clock }),
    /** Stops snarkjs' worker threads so the process can exit. */
    close: snarkjsEngine.close,
  };
};

export type Container = Awaited<ReturnType<typeof createContainer>>;
