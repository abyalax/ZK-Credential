import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadP6GasReference } from '../../../src/infrastructure/index.js';

let dir: string;

const writeRun = (runId: string, gas: unknown, folder = 'gas'): void => {
  const target = join(dir, runId, folder);
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'p6-benchmark.json'), JSON.stringify({ experiment: 'P6', gas }));
};

const measured = (verifyCredentialGas: number) => ({ status: 'measured', verifyCredentialGas, note: 'estimateGas' });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'p6-results-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('loadP6GasReference', () => {
  it('returns undefined when the results directory does not exist', () => {
    expect(loadP6GasReference(join(dir, 'missing'))).toBeUndefined();
  });

  it('returns undefined when no run measured gas', () => {
    writeRun('2026-11-22-081920', { status: 'unavailable', verifyCredentialGas: null, note: 'chain offline' });
    expect(loadP6GasReference(dir)).toBeUndefined();
  });

  it('reads the gas of a measured run together with its run id', () => {
    writeRun('2026-11-22-081902', measured(251_374));
    expect(loadP6GasReference(dir)).toEqual({ verifyCredentialGas: 251_374, runId: '2026-11-22-081902' });
  });

  it('prefers the newest run that measured gas and skips newer runs without it', () => {
    writeRun('2026-11-20-100000', measured(111_111));
    writeRun('2026-11-22-081902', measured(251_374));
    writeRun('2026-11-23-090000', { status: 'unavailable', verifyCredentialGas: null, note: 'x' });
    expect(loadP6GasReference(dir)?.runId).toBe('2026-11-22-081902');
  });

  it('ignores the no-gas folder and values that are not a positive integer', () => {
    writeRun('2026-11-24-000000', measured(999), 'no-gas');
    writeRun('2026-11-23-000000', measured(0));
    writeRun('2026-11-22-000000', measured(1.5));
    expect(loadP6GasReference(dir)).toBeUndefined();
  });

  it('ignores a malformed report instead of throwing', () => {
    const target = join(dir, '2026-11-25-000000', 'gas');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'p6-benchmark.json'), '{ not json');
    writeRun('2026-11-22-081902', measured(251_374));
    expect(loadP6GasReference(dir)?.verifyCredentialGas).toBe(251_374);
  });
});
