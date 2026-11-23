import { describe, expect, it } from 'vitest';
import { summarize } from '../../../experiments/benchmarks/stats.js';
import { CONFIGURATION_IDS, CONFIGURATIONS } from '../../../experiments/configurations/index.js';
import { VARIANT_NAMES } from '../../../experiments/scenarios/types.js';

describe('benchmark statistics', () => {
  it('computes mean, median, sample std, min and max', () => {
    const result = summarize([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(result.n).toBe(8);
    expect(result.mean).toBe(5);
    expect(result.median).toBe(4.5);
    expect(result.std).toBeCloseTo(2.138, 3);
    expect([result.min, result.max]).toEqual([2, 9]);
  });

  it('reports zero std for a single value and rejects an empty sample', () => {
    expect(summarize([3]).std).toBe(0);
    expect(() => summarize([])).toThrow(RangeError);
  });
});

describe('P6 configurations', () => {
  it('covers baseline A, one circuit variant per ablation step, then the SD-JWT baseline', () => {
    expect(CONFIGURATIONS.map((configuration) => configuration.id)).toEqual([...CONFIGURATION_IDS]);
    expect(CONFIGURATIONS.map((configuration) => configuration.circuit)).toEqual([undefined, ...VARIANT_NAMES, undefined]);
    expect(CONFIGURATIONS.at(-1)?.id).toBe('SD');
  });

  it('adds guarantees monotonically along B1 -> B4', () => {
    const count = (id: string) => {
      const guarantees = CONFIGURATIONS.find((configuration) => configuration.id === id)?.guarantees;
      return Object.values(guarantees ?? {}).filter(Boolean).length;
    };
    expect(['B1', 'B2', 'B3', 'B4'].map(count)).toEqual([0, 1, 2, 3]);
  });
});
