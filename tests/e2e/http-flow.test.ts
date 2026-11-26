import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RunSummary } from '../../src/application/index.js';
import { deployCredentialVerifierStack } from '../../src/infrastructure/index.js';
import { type Container, createContainer, loadConfig } from '../../src/interfaces/composition/index.js';
import { createApp } from '../../src/interfaces/http/index.js';
import { startLocalChain } from '../chain/support/local-chain.js';

/**
 * U1: the simulation server end to end, with real Groth16 proofs and the in-process Hardhat chain, as
 * docs/ui/contract.md asks ("Tes kontrak", sisi server). Needs `pnpm setup:zk full`, `pnpm chain:sync`
 * and `pnpm chain:build` (`pnpm test:e2e`). Runs on one machine at a time: peak memory is the B4 prover's.
 */

let container: Container;
let server: Server;
let base: string;

beforeAll(async () => {
  const chain = await startLocalChain();
  const owner = chain.accounts[0];
  if (!owner) throw new Error('local chain has no accounts');
  const walletClient = chain.walletFor(owner);
  const deployed = await deployCredentialVerifierStack({ publicClient: chain.publicClient, walletClient });
  container = await createContainer(
    loadConfig({
      ISSUER_REGISTRY_ADDRESS: deployed.issuerRegistry,
      CREDENTIAL_VERIFIER_ADDRESS: deployed.credentialVerifier,
      ISSUER_PRIVATE_KEY: '33'.repeat(32),
    }),
    { publicClient: chain.publicClient, walletClient },
  );
  await container.issuers.addIssuer(container.issuer.publicKey);

  const { app } = createApp({ services: container });
  server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) => server?.close(resolve));
  await container?.close();
});

const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return (await response.json()) as T;
};

/** Starts a run and reads its stream to the end. */
const runScenario = async (scenarioId: string): Promise<RunSummary> => {
  const { runId } = await call<{ runId: string }>('POST', '/api/runs', { configuration: 'B4', scenarioId });
  const text = await (await fetch(`${base}/api/runs/${runId}/events`)).text();
  const block = text.split('\n\n').find((part) => part.startsWith('event: run.completed'));
  if (!block) throw new Error(`run ${runId} ended without run.completed`);
  return JSON.parse(block.split('\n')[1]?.slice(6) ?? '') as RunSummary;
};

type Envelope<T> = { ok: true; value: T } | { ok: false; error: string };

describe('role endpoints with real proofs', () => {
  it('issues, challenges, proves and verifies; the replay is rejected', async () => {
    expect(await call('GET', '/api/issuer')).toMatchObject({ registered: true });
    const issued = await call<Envelope<{ id: string }>>('POST', '/api/issuer/credentials', {
      studentNumber: '2210001',
      fullName: 'E2E Student',
      degree: 'S.Kom.',
      graduationDate: '2026-08-01',
      gpa: 375,
    });
    if (!issued.ok) throw new Error(issued.error);
    const challenge = await call<{ value: string }>('POST', '/api/verifier/challenges', {
      verifierId: 'verifier-e2e',
      ttlMs: 60_000,
    });
    const proof = await call<Envelope<unknown>>('POST', '/api/holder/proofs', {
      credentialId: issued.value.id,
      challenge: challenge.value,
      verifierId: 'verifier-e2e',
      threshold: 300,
    });
    if (!proof.ok) throw new Error(proof.error);

    const body = { proof: proof.value, verifierId: 'verifier-e2e', requiredThreshold: 300 };
    expect(await call('POST', '/api/verifier/verifications', body)).toMatchObject({ accepted: true, reason: 'ACCEPTED' });
    expect(await call('POST', '/api/verifier/verifications', body)).toMatchObject({
      accepted: false,
      reason: 'CHALLENGE_ALREADY_USED',
    });
  });
});

describe('simulation runs with real proofs: same outcome as P5 on B4', () => {
  it.each([
    ['valid-accepted', 'ACCEPTED'],
    ['holder-without-key', 'PROVE_FAILED'],
    ['gpa-below-threshold', 'PROVE_FAILED'],
    ['replay-same-proof', 'CHALLENGE_ALREADY_USED'],
    ['replay-relabelled-challenge', 'PROOF_INVALID'],
    ['proof-bytes-tampered', 'PROOF_INVALID'],
    ['challenge-expired', 'CHALLENGE_EXPIRED'],
  ])('%s -> %s', async (scenarioId, reason) => {
    expect((await runScenario(scenarioId)).outcome.reason).toBe(reason);
  });
});
