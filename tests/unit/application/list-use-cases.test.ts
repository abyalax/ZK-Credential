import { describe, expect, it } from 'vitest';
import { makeGetIssuerProfile, makeListChallenges } from '../../../src/application/index.js';
import { asChallengeValue, asVerifierId, createChallenge } from '../../../src/domain/index.js';
import { createInMemoryChallengeStore, createStaticIssuerRegistry } from '../../../src/infrastructure/index.js';
import { createFakeClock, testIssuer } from '../../support/fakes.js';
import { createHarness } from '../../support/harness.js';

describe('makeListChallenges', () => {
  it('returns newest first with the status at the current time', async () => {
    const clock = createFakeClock(10_000);
    const challenges = createInMemoryChallengeStore();
    const make = (hex: string, now: number, ttlMs: number) =>
      createChallenge({ value: asChallengeValue(hex.repeat(31)), verifierId: asVerifierId('v'), now, ttlMs });
    const [old, used, fresh] = [make('aa', 1_000, 100), make('bb', 5_000, 100_000), make('cc', 9_000, 100_000)];
    for (const challenge of [old, used, fresh]) await challenges.save(challenge);
    await challenges.markConsumed(used.value, 6_000);

    const listed = await makeListChallenges({ challenges, clock })();
    expect(listed.map(({ challenge, status }) => [challenge.value.slice(0, 2), status])).toEqual([
      ['cc', 'issued'],
      ['bb', 'consumed'],
      ['aa', 'expired'],
    ]);
  });

  it('turns a live challenge into expired as the clock advances', async () => {
    const harness = createHarness();
    const challenge = await harness.issueChallenge({ verifierId: asVerifierId('v'), ttlMs: 1_000 });
    const list = makeListChallenges({ challenges: harness.challenges, clock: harness.clock });
    expect((await list())[0]?.status).toBe('issued');
    harness.clock.advance(1_000);
    expect((await list())[0]).toMatchObject({ challenge: { value: challenge.value }, status: 'expired' });
  });
});

describe('makeGetIssuerProfile', () => {
  it('reports whether the registry trusts the configured issuer', async () => {
    expect(await makeGetIssuerProfile({ issuer: testIssuer, issuers: createStaticIssuerRegistry([testIssuer]) })()).toEqual({
      issuer: testIssuer,
      registered: true,
    });
    expect((await makeGetIssuerProfile({ issuer: testIssuer, issuers: createStaticIssuerRegistry([]) })()).registered).toBe(
      false,
    );
  });
});
