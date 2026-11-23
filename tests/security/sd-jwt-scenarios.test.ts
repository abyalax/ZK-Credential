import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../../experiments/scenarios/catalog.js';
import { createSdWorld, SD_NOT_APPLICABLE, SD_SCENARIOS } from '../../experiments/scenarios/sd-jwt.js';

/**
 * P5 for the SD-JWT baseline (D9). Needs no ZK artifacts, so it runs in `pnpm test`.
 * Every attack is rejected for the stated reason; every honest presentation is accepted.
 */

describe('SD-JWT baseline attack scenarios', () => {
  const world = createSdWorld();

  for (const scenario of SD_SCENARIOS) {
    it(`${scenario.id}: ${scenario.kind === 'honest' ? 'accepted' : `rejected (${scenario.reason})`}`, async () => {
      const outcome = await scenario.run(world);
      expect(outcome.accepted).toBe(scenario.kind === 'honest');
      expect(outcome.reason).toBe(scenario.reason);
    });
  }

  it('accounts for every catalog scenario: covered, SD-specific, or listed as not applicable', () => {
    const covered = new Set(SD_SCENARIOS.map((scenario) => scenario.id));
    const missing = SCENARIOS.map((scenario) => scenario.id).filter((id) => !(covered.has(id) || id in SD_NOT_APPLICABLE));
    expect(missing).toEqual([]);
  });
});
