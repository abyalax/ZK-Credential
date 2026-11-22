import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createFileChallengeStore,
  createFileCredentialRepository,
  deployCredentialVerifierStack,
} from '../../src/infrastructure/index.js';
import type { CliContext } from '../../src/interfaces/cli/index.js';
import { runCli } from '../../src/interfaces/cli/index.js';
import { createContainer, loadConfig } from '../../src/interfaces/composition/index.js';
import { startLocalChain } from '../chain/support/local-chain.js';

/**
 * P7: the whole demo through the CLI against the in-process Hardhat chain, with real Groth16
 * proofs. Needs `pnpm setup:zk full`, `pnpm chain:sync` and `pnpm chain:build` (`pnpm test:e2e`).
 */

const VERIFIER = 'verifier-e2e';

let stateDir: string;
let context: CliContext;

const run = async (...argv: string[]) => {
  const out: string[] = [];
  const errors: string[] = [];
  const code = await runCli(argv, { stdout: (t) => out.push(t), stderr: (t) => errors.push(t) }, context);
  const text = out.join('\n');
  return { code, errors: errors.join('\n'), json: text ? JSON.parse(text) : undefined };
};

beforeAll(async () => {
  const chain = await startLocalChain();
  const owner = chain.accounts[0];
  if (!owner) throw new Error('local chain has no accounts');
  const walletClient = chain.walletFor(owner);
  const deployed = await deployCredentialVerifierStack({
    publicClient: chain.publicClient,
    walletClient,
  });

  stateDir = await mkdtemp(join(tmpdir(), 'zk-credential-e2e-'));
  const config = loadConfig({
    ISSUER_REGISTRY_ADDRESS: deployed.issuerRegistry,
    CREDENTIAL_VERIFIER_ADDRESS: deployed.credentialVerifier,
    ISSUER_PRIVATE_KEY: '33'.repeat(32),
  });
  context = {
    stateDir,
    runBench: async () => 0,
    openContainer: () =>
      createContainer(config, {
        credentials: createFileCredentialRepository(join(stateDir, 'credentials.json')),
        challenges: createFileChallengeStore(join(stateDir, 'challenges.json')),
        publicClient: chain.publicClient,
        walletClient,
      }),
  };
});

afterAll(async () => {
  if (stateDir) await rm(stateDir, { recursive: true, force: true });
});

let credentialId: string;
let proofFile: string;

describe('CLI -> local chain -> accepted', () => {
  it('keygen, register-issuer and issue', async () => {
    expect((await run('keygen')).code).toBe(0);
    expect((await run('register-issuer')).json).toMatchObject({ registered: true });
    const issued = await run(
      'issue',
      '--student-number=2210001',
      '--name=Test Student',
      '--degree=S1 Teknik Komputer',
      '--graduation-date=2026-08-01',
      '--gpa=3.75',
    );
    expect(issued.code).toBe(0);
    credentialId = issued.json.credentialId;
  });

  it('challenge -> prove -> verify accepts, and never prints the holder private key', async () => {
    const { json: challenge } = await run('challenge', `--verifier-id=${VERIFIER}`);
    const proved = await run(
      'prove',
      `--credential-id=${credentialId}`,
      `--challenge=${challenge.value}`,
      `--verifier-id=${VERIFIER}`,
      '--threshold=3.50',
    );
    expect(proved.code).toBe(0);
    expect(JSON.stringify(proved.json)).not.toContain('privateKey');
    proofFile = proved.json.proofFile;

    const verified = await run('verify', `--proof=${proofFile}`, `--verifier-id=${VERIFIER}`, '--threshold=3.50');
    expect(verified.code).toBe(0);
    expect(verified.json).toMatchObject({ accepted: true, verifierId: VERIFIER });
  });
});

describe('CLI -> local chain -> rejected', () => {
  it('rejects replay of the same proof (exit code 2)', async () => {
    const replay = await run('verify', `--proof=${proofFile}`, `--verifier-id=${VERIFIER}`, '--threshold=3.50');
    expect(replay.code).toBe(2);
    expect(replay.json).toEqual({ accepted: false, reason: 'CHALLENGE_ALREADY_USED' });
  });

  it('refuses to prove a threshold above the GPA', async () => {
    const { json: challenge } = await run('challenge', `--verifier-id=${VERIFIER}`);
    const proved = await run(
      'prove',
      `--credential-id=${credentialId}`,
      `--challenge=${challenge.value}`,
      `--verifier-id=${VERIFIER}`,
      '--threshold=3.90',
    );
    expect(proved.code).toBe(1);
    expect(proved.errors).toContain('ATTRIBUTE_BELOW_THRESHOLD');
  });
});
