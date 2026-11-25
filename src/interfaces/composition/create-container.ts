import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat } from 'viem/chains';
import type {
  ChallengeStore,
  Clock,
  CredentialRepository,
  CredentialSigner,
  HolderKeyring,
  IssuerRegistry,
  ProofEngine,
  Randomness,
} from '../../application/index.js';
import {
  makeGenerateProof,
  makeGetIssuerProfile,
  makeIssueChallenge,
  makeIssueCredential,
  makeListChallenges,
  makeListCredentials,
  makeRunScenario,
  makeVerifyCredential,
} from '../../application/index.js';
import type { Issuer } from '../../domain/index.js';
import { asIssuerId } from '../../domain/index.js';
import {
  createEddsaCredentialSigner,
  createInMemoryChallengeStore,
  createInMemoryCredentialRepository,
  createInMemoryHolderKeyring,
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
  /** Holder key source for the HTTP demo server; defaults to a key that lives only in memory. */
  readonly holderKeyring?: HolderKeyring;
  /** Injected chain clients (e.g. the in-process Hardhat network in e2e tests). */
  readonly publicClient?: PublicClient;
  readonly walletClient?: WalletClient;
}

interface UseCaseParts {
  readonly issuer: Issuer;
  readonly issuers: IssuerRegistry;
  readonly signer: CredentialSigner;
  readonly proofEngine: ProofEngine;
  readonly credentials: CredentialRepository;
  readonly challenges: ChallengeStore;
  readonly holderKeyring: HolderKeyring;
  readonly clock: Clock;
  readonly randomness: Randomness;
}

/** Binds the use cases to their ports. Pure wiring: it opens no connection and reads no file. */
const wireUseCases = (parts: UseCaseParts) => {
  const { issuer, issuers, signer, proofEngine, credentials, challenges, holderKeyring, clock, randomness } = parts;
  const issueCredential = makeIssueCredential({ credentials, issuers, signer, clock, randomness });
  const issueChallenge = makeIssueChallenge({ challenges, clock, randomness });
  const generateProof = makeGenerateProof({ credentials, proofEngine });
  const verifyCredential = makeVerifyCredential({ challenges, issuers, proofEngine, clock });
  return {
    issuer,
    clock,
    holderKeyring,
    issueCredential,
    issueChallenge,
    generateProof,
    verifyCredential,
    getIssuerProfile: makeGetIssuerProfile({ issuer, issuers }),
    listCredentials: makeListCredentials({ credentials }),
    listChallenges: makeListChallenges({ challenges, clock }),
    runScenario: makeRunScenario({
      issuer,
      issuers,
      holderKeyring,
      clock,
      issueCredential,
      issueChallenge,
      generateProof,
      verifyCredential,
    }),
  };
};

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

  const useCases = wireUseCases({
    issuer,
    issuers,
    signer,
    proofEngine,
    credentials: overrides.credentials ?? createInMemoryCredentialRepository(),
    challenges: overrides.challenges ?? createInMemoryChallengeStore(),
    holderKeyring: overrides.holderKeyring ?? createInMemoryHolderKeyring(),
    clock: systemClock,
    randomness: cryptoRandomness,
  });

  return {
    ...useCases,
    // The on-chain registry, not just the `IssuerRegistry` port: the CLI registers issuers through it.
    issuers,
    /** Stops snarkjs' worker threads so the process can exit. */
    close: snarkjsEngine.close,
  };
};

export type Container = Awaited<ReturnType<typeof createContainer>>;
