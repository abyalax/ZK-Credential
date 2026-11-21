import type { Address } from 'viem';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Issuer, Proof } from '../../src/domain/index.js';
import {
  BN254_FIELD_ORDER,
  createEddsaCredentialSigner,
  createOnChainIssuerRegistry,
  createOnChainProofEngine,
  createSnarkjsProofEngine,
  createStaticIssuerRegistry,
  deployCredentialVerifierStack,
  fullVariant,
  generateHolderKeyPair,
  type HolderKeyPair,
  issuerKeyHash,
  loadContractArtifact,
  type SnarkjsProofEngine,
  toVerifyCredentialArgs,
  type VerifyCredentialArgs,
} from '../../src/infrastructure/index.js';
import { createHarness, gpa, verifierA } from '../support/harness.js';
import { type LocalChain, startLocalChain } from './support/local-chain.js';

/**
 * P4.3: contract tests on the in-process Hardhat network with real Groth16 proofs of the `full`
 * circuit. Needs `pnpm zk:setup full`, `pnpm chain:sync` and `pnpm chain:build` (`pnpm test:chain`).
 */

const policy = { verifierId: verifierA, requiredGpaThreshold: gpa(300) };
const deterministic = (byte: number) => (size: number) => new Uint8Array(size).fill(byte);

let issuer: Issuer;
let signer: Awaited<ReturnType<typeof createEddsaCredentialSigner>>;
let holder: HolderKeyPair;
let snarkjsEngine: SnarkjsProofEngine;
let proof: Proof;
let args: VerifyCredentialArgs;

beforeAll(async () => {
  signer = await createEddsaCredentialSigner('22'.repeat(32));
  issuer = { id: 'issuer-p4' as Issuer['id'], name: 'P4 test issuer', publicKey: signer.publicKey };
  holder = await generateHolderKeyPair(deterministic(0x22));
  snarkjsEngine = await createSnarkjsProofEngine({
    variant: fullVariant,
    issuers: createStaticIssuerRegistry([issuer]),
  });

  const h = createHarness({ proofEngine: snarkjsEngine, signer, issuer, holder });
  proof = await h.presentProof(await h.issueTestCredential(375));
  args = toVerifyCredentialArgs(JSON.parse(proof.payload));
});

afterAll(async () => {
  await snarkjsEngine?.close();
});

interface Setup {
  readonly chain: LocalChain;
  readonly owner: Address;
  readonly stranger: Address;
  readonly registryAddress: Address;
  readonly verifierAddress: Address;
  readonly registry: ReturnType<typeof createOnChainIssuerRegistry>;
  readonly engine: ReturnType<typeof createOnChainProofEngine>;
  readonly callVerify: (
    pubSignals?: VerifyCredentialArgs['pubSignals'],
    pA?: VerifyCredentialArgs['pA'],
  ) => Promise<boolean>;
}

/** Fresh chain with the contracts deployed; the test issuer is registered only when asked. */
const setup = async ({ registerIssuer }: { registerIssuer: boolean }): Promise<Setup> => {
  const chain = await startLocalChain();
  const [owner, stranger] = chain.accounts as [Address, Address];
  const deployed = await deployCredentialVerifierStack({
    publicClient: chain.publicClient,
    walletClient: chain.walletFor(owner),
  });
  const registry = createOnChainIssuerRegistry({
    publicClient: chain.publicClient,
    walletClient: chain.walletFor(owner),
    contractAddress: deployed.issuerRegistry,
    issuers: [issuer],
  });
  if (registerIssuer) await registry.addIssuer(issuer.publicKey);

  const { abi } = await loadContractArtifact('CredentialVerifier');
  const engine = createOnChainProofEngine({
    generator: snarkjsEngine,
    variant: fullVariant,
    publicClient: chain.publicClient,
    credentialVerifierAddress: deployed.credentialVerifier,
  });
  return {
    chain,
    owner,
    stranger,
    registryAddress: deployed.issuerRegistry,
    verifierAddress: deployed.credentialVerifier,
    registry,
    engine,
    callVerify: async (pubSignals = args.pubSignals, pA = args.pA) =>
      (await chain.publicClient.readContract({
        address: deployed.credentialVerifier,
        abi,
        functionName: 'verifyCredential',
        args: [pA, args.pB, args.pC, pubSignals],
      })) as boolean,
  };
};

const withSignal = (index: number, value: bigint): VerifyCredentialArgs['pubSignals'] => {
  const copy = [...args.pubSignals] as [bigint, bigint, bigint, bigint];
  copy[index] = value;
  return copy;
};

describe('CredentialVerifier: honest flow', () => {
  it('accepts a valid proof from a registered issuer', async () => {
    const { callVerify } = await setup({ registerIssuer: true });
    expect(await callVerify()).toBe(true);
  });

  it('matches the public signal order of the circuit', async () => {
    const { chain, verifierAddress } = await setup({ registerIssuer: true });
    const { abi } = await loadContractArtifact('CredentialVerifier');
    const position = (name: string) =>
      chain.publicClient.readContract({ address: verifierAddress, abi, functionName: name });

    expect(
      await Promise.all(
        ['ISSUER_KEY_HASH', 'GPA_THRESHOLD', 'CHALLENGE', 'VERIFIER_ID'].map(position),
      ),
    ).toEqual([0n, 1n, 2n, 3n]);
    expect(args.pubSignals[0]).toBe(await issuerKeyHash(issuer.publicKey));
    expect(args.pubSignals[1]).toBe(300n);
  });

  it('runs the whole domain flow through the on-chain proof engine', async () => {
    const { engine } = await setup({ registerIssuer: true });
    const h = createHarness({ proofEngine: engine, signer, issuer, holder });
    const presented = await h.presentProof(await h.issueTestCredential(375));

    expect(await h.verifyCredential({ proof: presented, policy })).toMatchObject({ ok: true });
  });
});

describe('CredentialVerifier: rejections', () => {
  it('reverts for an issuer that is not registered', async () => {
    const { callVerify, engine } = await setup({ registerIssuer: false });

    await expect(callVerify()).rejects.toThrow(/UntrustedIssuer/);
    expect(await engine.verify(proof)).toBe(false);
  });

  it('turns an unregistered issuer into PROOF_INVALID in the domain flow', async () => {
    const { engine } = await setup({ registerIssuer: false });
    const h = createHarness({ proofEngine: engine, signer, issuer, holder });
    const presented = await h.presentProof(await h.issueTestCredential(375));

    expect(await h.verifyCredential({ proof: presented, policy })).toEqual({
      ok: false,
      error: 'PROOF_INVALID',
    });
  });

  it('rejects a tampered proof point', async () => {
    const { callVerify } = await setup({ registerIssuer: true });
    expect(await callVerify(undefined, [args.pA[0] + 1n, args.pA[1]])).toBe(false);
  });

  it.each([
    ['gpaThreshold', 1, 200n],
    ['challenge', 2, 12345n],
    ['verifierId', 3, 12345n],
  ])('rejects a tampered %s public signal', async (_name, index, value) => {
    const { callVerify } = await setup({ registerIssuer: true });
    expect(await callVerify(withSignal(index, value))).toBe(false);
  });

  it('rejects another registered issuer swapped into the signals', async () => {
    const { callVerify, registry } = await setup({ registerIssuer: true });
    const otherKey = '3:4';
    await registry.addIssuer(otherKey);

    expect(await callVerify(withSignal(0, await issuerKeyHash(otherKey)))).toBe(false);
  });

  it('rejects a public signal outside the BN254 field', async () => {
    const { callVerify } = await setup({ registerIssuer: true });
    expect(await callVerify(withSignal(3, args.pubSignals[3] + BN254_FIELD_ORDER))).toBe(false);
  });
});

describe('IssuerRegistry', () => {
  it('lets only the owner register issuers', async () => {
    const { chain, owner, stranger, registryAddress } = await setup({ registerIssuer: false });
    const { abi } = await loadContractArtifact('IssuerRegistry');
    const hash = await issuerKeyHash(issuer.publicKey);

    await expect(
      chain.walletFor(stranger).writeContract({
        address: registryAddress,
        abi,
        functionName: 'addIssuer',
        args: [hash],
      }),
    ).rejects.toThrow(/NotOwner/);
    expect(
      await chain.publicClient.readContract({
        address: registryAddress,
        abi,
        functionName: 'isTrusted',
        args: [hash],
      }),
    ).toBe(false);
    expect(
      await chain.publicClient.readContract({
        address: registryAddress,
        abi,
        functionName: 'owner',
      }),
    ).toBe(owner);
  });

  it('rejects the same issuer twice and emits an event on success', async () => {
    const { chain, registry, registryAddress } = await setup({ registerIssuer: true });
    const { abi } = await loadContractArtifact('IssuerRegistry');

    await expect(registry.addIssuer(issuer.publicKey)).rejects.toThrow();
    const logs = await chain.publicClient.getContractEvents({
      address: registryAddress,
      abi,
      eventName: 'IssuerAdded',
      fromBlock: 0n,
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.args).toMatchObject({ publicKeyHash: await issuerKeyHash(issuer.publicKey) });
  });

  it('reports trust to the domain through list()', async () => {
    const { registry } = await setup({ registerIssuer: true });
    expect(await registry.list()).toEqual([issuer]);
  });
});
