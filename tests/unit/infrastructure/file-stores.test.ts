import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asChallengeValue, asVerifierId, createChallenge } from '../../../src/domain/index.js';
import {
  createFileChallengeStore,
  createFileCredentialRepository,
  createInMemoryChallengeStore,
  createInMemoryCredentialRepository,
} from '../../../src/infrastructure/index.js';
import { createFakeClock, createFakeRandomness, createFakeSigner, testIssuer } from '../../support/fakes.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'zk-file-stores-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const challenge = createChallenge({
  value: asChallengeValue('ab'.repeat(31)),
  verifierId: asVerifierId('verifier-a'),
  now: 1_000,
  ttlMs: 60_000,
});

describe('file challenge store', () => {
  it('persists across instances, as separate CLI processes would', async () => {
    const path = join(dir, 'challenges.json');
    await createFileChallengeStore(path).save(challenge);
    const reopened = createFileChallengeStore(path);
    expect((await reopened.find(challenge.value))?.challenge).toEqual(challenge);
  });

  it('consumes a challenge once, even for parallel attempts', async () => {
    const store = createFileChallengeStore(join(dir, 'challenges.json'));
    await store.save(challenge);
    const results = await Promise.all([store.markConsumed(challenge.value, 2_000), store.markConsumed(challenge.value, 2_001)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('does not consume an unknown challenge', async () => {
    const store = createFileChallengeStore(join(dir, 'challenges.json'));
    expect(await store.markConsumed(challenge.value, 1)).toBe(false);
  });
});

describe('file credential repository', () => {
  it('returns undefined for an unknown id on a fresh state dir', async () => {
    const repository = createFileCredentialRepository(join(dir, 'credentials.json'));
    expect(await repository.findById('missing' as never)).toBeUndefined();
  });
});

describe('list()', () => {
  const second = createChallenge({
    value: asChallengeValue('cd'.repeat(31)),
    verifierId: asVerifierId('verifier-b'),
    now: 2_000,
    ttlMs: 60_000,
  });

  it.each([
    ['file', () => createFileChallengeStore(join(dir, 'challenges.json'))],
    ['in-memory', createInMemoryChallengeStore],
  ])('%s challenge store lists every challenge with its consumption state', async (_name, create) => {
    const store = create();
    expect(await store.list()).toEqual([]);
    await store.save(challenge);
    await store.save(second);
    await store.markConsumed(challenge.value, 3_000);
    const listed = await store.list();
    expect(listed.map((entry) => entry.challenge.value)).toEqual([challenge.value, second.value]);
    expect(listed.map((entry) => entry.consumedAt)).toEqual([3_000, undefined]);
  });

  it.each([
    ['file', () => createFileCredentialRepository(join(dir, 'credentials.json'))],
    ['in-memory', createInMemoryCredentialRepository],
  ])('%s credential repository lists saved credentials, oldest first', async (_name, create) => {
    const repository = create();
    expect(await repository.list()).toEqual([]);
    const { makeIssueCredential } = await import('../../../src/application/index.js');
    const { createStaticIssuerRegistry } = await import('../../../src/infrastructure/index.js');
    const issue = makeIssueCredential({
      credentials: repository,
      issuers: createStaticIssuerRegistry([testIssuer]),
      signer: createFakeSigner(),
      clock: createFakeClock(),
      randomness: createFakeRandomness(),
    });
    const input = {
      issuerId: testIssuer.id,
      holderPublicKey: '1',
      studentNumber: '1',
      fullName: 'A',
      degree: 'S.Kom.',
      graduationDate: '2026-01-01',
      gpa: 300,
    };
    await issue(input);
    await issue({ ...input, fullName: 'B' });
    expect((await repository.list()).map((entry) => entry.credential.fullName)).toEqual(['A', 'B']);
  });
});
