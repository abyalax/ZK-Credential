/**
 * Measures one configuration in its own process, so `maxRSS` is the peak memory of that
 * configuration alone. Prints a single JSON line prefixed with RESULT_PREFIX.
 *
 * Usage: node --import tsx experiments/benchmarks/worker.ts <args-file-path>
 */
import { findConfiguration } from '../configurations/index.js';
import { createRunner } from '../configurations/runner.js';

export const RESULT_PREFIX = 'P6_RESULT ';

const toMb = (bytes: number): number => Math.round((bytes / 1024 ** 2) * 10) / 10;

export interface WorkerResult {
  configuration: string;
  runs: number;
  warmup: number;
  constraints: number | null;
  proofBytes: number;
  payloadBytes: number;
  rssBeforeSetupMb: number;
  peakRssMb: number;
  proveMs: number[];
  verifyMs: number[];
}

export const runWorker = async (id: string, runs: number, warmup: number): Promise<WorkerResult> => {
  const configuration = findConfiguration(id);
  const rssBeforeSetupMb = toMb(process.memoryUsage().rss);
  const runner = await createRunner(configuration);
  const proveMs: number[] = [];
  const verifyMs: number[] = [];
  let sizes = { proofBytes: 0, payloadBytes: 0 };

  try {
    for (let index = 0; index < warmup + runs; index++) {
      const proveStart = performance.now();
      const presentation = await runner.prove();
      const verifyStart = performance.now();
      const accepted = await runner.verify(presentation);
      const verifyEnd = performance.now();
      if (!accepted) throw new Error(`Configuration ${id} rejected its own honest presentation`);
      sizes = { proofBytes: presentation.proofBytes, payloadBytes: presentation.payloadBytes };
      if (index < warmup) continue;
      proveMs.push(verifyStart - proveStart);
      verifyMs.push(verifyEnd - verifyStart);
    }
  } finally {
    await runner.close();
  }

  return {
    configuration: id,
    runs,
    warmup,
    constraints: runner.constraints ?? null,
    ...sizes,
    rssBeforeSetupMb,
    peakRssMb: toMb(process.resourceUsage().maxRSS * 1024),
    proveMs,
    verifyMs,
  };
};
