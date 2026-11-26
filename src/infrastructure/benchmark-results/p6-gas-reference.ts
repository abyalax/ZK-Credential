import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPOSITORY_ROOT } from '../proof-system/artifact-paths.js';

/** Where `pnpm experiment:p6` writes its runs: one `<timestamp>/gas/p6-benchmark.json` per run. */
export const P6_RESULTS_DIR = join(REPOSITORY_ROOT, 'experiments', 'results');

export interface GasReference {
  /** `estimateGas` of `CredentialVerifier.verifyCredential` with an honest proof (B4 only). */
  readonly verifyCredentialGas: number;
  /** The P6 run it was read from, e.g. `2026-11-22-081902`. */
  readonly runId: string;
}

const gasOf = (file: string): number | undefined => {
  try {
    const report = (JSON.parse(readFileSync(file, 'utf8')) as { gas?: { status?: unknown; verifyCredentialGas?: unknown } }).gas;
    const gas = report?.verifyCredentialGas;
    return report?.status === 'measured' && typeof gas === 'number' && Number.isInteger(gas) && gas > 0 ? gas : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Reads the gas figure of the newest P6 run that measured it. The simulation shows this number; it never
 * recomputes it (docs/architecture/ui-simulation.md). Returns `undefined` when no run measured gas, for
 * example before `pnpm experiment:p6` or when only `--no-gas` runs exist.
 */
export const loadP6GasReference = (resultsDir: string = P6_RESULTS_DIR): GasReference | undefined => {
  if (!existsSync(resultsDir)) return undefined;
  const runs = readdirSync(resultsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a,b) => a.localeCompare(b))
    .reverse();
  for (const runId of runs) {
    const gas = gasOf(join(resultsDir, runId, 'gas', 'p6-benchmark.json'));
    if (gas !== undefined) return { verifyCredentialGas: gas, runId };
  }
  return undefined;
};
