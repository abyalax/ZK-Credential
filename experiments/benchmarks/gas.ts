import type { Address } from 'viem';
import {
  createOnChainIssuerRegistry,
  deployCredentialVerifierStack,
  loadContractArtifact,
  toVerifyCredentialArgs,
} from '../../src/infrastructure/index.js';
import { startLocalChain } from '../../tests/chain/support/local-chain.js';
import { createScenarioContext } from '../scenarios/context.js';

export interface GasReport {
  readonly status: 'measured' | 'unavailable';
  /** `estimateGas` of `CredentialVerifier.verifyCredential` with an honest `full` proof. */
  readonly verifyCredentialGas: number | null;
  readonly note: string;
}

/**
 * Gas is only defined for B4: it is the only variant with an on-chain verifier
 * (`CredentialVerifier`). The challenge check stays off-chain and costs no gas. Needs
 * `pnpm setup:zk full`, `pnpm chain:sync` and `pnpm chain:build` first.
 */
export const measureProposedModelGas = async (): Promise<GasReport> => {
  try {
    const ctx = await createScenarioContext('full');
    try {
      const chain = await startLocalChain();
      const [owner] = chain.accounts as [Address];
      const deployed = await deployCredentialVerifierStack({
        publicClient: chain.publicClient,
        walletClient: chain.walletFor(owner),
      });
      const registry = createOnChainIssuerRegistry({
        publicClient: chain.publicClient,
        walletClient: chain.walletFor(owner),
        contractAddress: deployed.issuerRegistry,
        issuers: [ctx.issuer],
      });
      await registry.addIssuer(ctx.issuer.publicKey);

      const session = ctx.session();
      const proof = await session.presentProof(await session.issueTestCredential(375));
      const args = toVerifyCredentialArgs(JSON.parse(proof.payload));
      const { abi } = await loadContractArtifact('CredentialVerifier');
      const gas = await chain.publicClient.estimateContractGas({
        address: deployed.credentialVerifier,
        abi,
        functionName: 'verifyCredential',
        args: [args.pA, args.pB, args.pC, args.pubSignals],
        account: owner,
      });
      return {
        status: 'measured',
        verifyCredentialGas: Number(gas),
        note: 'estimateGas of CredentialVerifier.verifyCredential on in-process Hardhat; challenge check is off-chain (no gas)',
      };
    } finally {
      await ctx.close();
    }
  } catch (error) {
    return {
      status: 'unavailable',
      verifyCredentialGas: null,
      note: `Gas not measured: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};
