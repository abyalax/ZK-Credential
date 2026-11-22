import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asChallengeValue, asVerifierId, createChallenge } from '../../../src/domain/index.js';
import { createFileChallengeStore, createFileCredentialRepository } from '../../../src/infrastructure/index.js';

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
