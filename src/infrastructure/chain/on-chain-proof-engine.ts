import { type Address, BaseError, ContractFunctionRevertedError, type PublicClient } from 'viem';
import type { ProofEngine } from '../../application/index.js';
import type { CircuitVariant } from '../proof-system/circuit-variants.js';
import { parsePayload, sameSignals } from '../proof-system/proof-payload.js';
import { toVerifyCredentialArgs } from './groth16-calldata.js';

const credentialVerifierAbi = [
  {
    type: 'function',
    name: 'verifyCredential',
    stateMutability: 'view',
    inputs: [
      { name: 'pA', type: 'uint256[2]' },
      { name: 'pB', type: 'uint256[2][2]' },
      { name: 'pC', type: 'uint256[2]' },
      { name: 'pubSignals', type: 'uint256[4]' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export interface OnChainProofEngineOptions {
  /** Produces proofs off-chain (snarkjs). Must use the same circuit variant as the contract. */
  readonly generator: ProofEngine;
  /** The circuit variant whose public signals the contract expects (the `full` variant). */
  readonly variant: CircuitVariant;
  readonly publicClient: PublicClient;
  readonly credentialVerifierAddress: Address;
}

/** A contract revert (e.g. `UntrustedIssuer`) is a rejection; transport errors are not. */
const isContractRevert = (error: unknown): boolean =>
  error instanceof BaseError &&
  error.walk((cause) => cause instanceof ContractFunctionRevertedError) !== null;

/**
 * `ProofEngine` whose verification goes through `CredentialVerifier` on the local chain.
 * Proving stays off-chain. Claims are first checked against the payload's public signals, exactly
 * like the snarkjs engine, so a relabelled claim is rejected before it reaches the chain.
 */
export const createOnChainProofEngine = ({
  generator,
  variant,
  publicClient,
  credentialVerifierAddress,
}: OnChainProofEngineOptions): ProofEngine => ({
  generate: (input) => generator.generate(input),
  async verify(proof) {
    if (proof.protocol !== 'groth16') return false;
    const content = parsePayload(proof.payload);
    if (!content) return false;
    let expected: readonly string[];
    try {
      expected = await variant.expectedPublicSignals(proof.publicSignals);
    } catch {
      return false;
    }
    if (!sameSignals(expected, content.publicSignals)) return false;

    let args: ReturnType<typeof toVerifyCredentialArgs>;
    try {
      args = toVerifyCredentialArgs(content);
    } catch {
      return false;
    }
    try {
      return await publicClient.readContract({
        address: credentialVerifierAddress,
        abi: credentialVerifierAbi,
        functionName: 'verifyCredential',
        args: [args.pA, args.pB, args.pC, args.pubSignals],
      });
    } catch (error) {
      if (isContractRevert(error)) return false;
      throw error;
    }
  },
});
