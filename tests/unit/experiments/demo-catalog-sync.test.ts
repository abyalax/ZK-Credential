import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../../../experiments/scenarios/catalog.js';
import { FIELD_ORDER } from '../../../src/application/simulation/proof-tampering.js';
import { SCENARIO_CATALOG } from '../../../src/application/index.js';
import { BN254_FIELD_ORDER } from '../../../src/infrastructure/index.js';

/**
 * The server cannot import `experiments/` or `tests/` (docs/architecture/ui-simulation.md, design point 2), so it
 * keeps a copy of the scenario metadata. This test fails when the two drift apart.
 */
describe('simulation scenario catalog', () => {
  it('matches experiments/scenarios/catalog.ts field by field, in the same order', () => {
    const fromExperiments = SCENARIOS.map(({ id, title, kind, category, openIn, fullReason }) => ({
      id,
      title,
      kind,
      category,
      openIn,
      fullReason,
    }));
    expect(SCENARIO_CATALOG).toEqual(fromExperiments);
  });

  it('uses the BN254 field order of the cryptography adapter', () => {
    expect(FIELD_ORDER).toBe(BN254_FIELD_ORDER);
  });
});
