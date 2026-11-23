/**
 * P6.2: benchmark harness. Runs every configuration in its own process (warm-up + N measured
 * repetitions, default 5 + 30) and writes structured results to experiments/results/.
 *
 * Usage: pnpm experiment:p6 [--runs=30] [--warmup=5] [--no-gas] [A B1 B2 B3 B4 SD]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPOSITORY_ROOT } from '../../src/infrastructure/index.js';
import { CONFIGURATION_IDS, CONFIGURATIONS, findConfiguration } from '../configurations/index.js';
import { generateTimestamp, resolveResultsPath } from '../results-utils.js';
import { describeEnvironment } from './environment.js';
import { type GasReport, measureProposedModelGas } from './gas.js';
import { summarize } from './stats.js';
import { runWorker as runWorkerImpl, type WorkerResult } from './worker.js';

const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const numberFlag = (args: readonly string[], name: string, fallback: number): number => {
  const raw = args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${name} must be a positive integer`);
  return value;
};

const runWorker = async (id: string, runs: number, warmup: number): Promise<WorkerResult> => {
  return runWorkerImpl(id, runs, warmup);
};

const csv = (header: readonly string[], rows: readonly (readonly (string | number)[])[]): string =>
  `${[header, ...rows].map((row) => row.join(',')).join('\n')}\n`;

const round = (value: number, digits = 3): number => Number(value.toFixed(digits));

interface BenchmarkOptions {
  runs: number;
  warmup: number;
  requested: string[];
}

const parseArguments = (args: string[]): BenchmarkOptions => ({
  runs: numberFlag(args, 'runs', 30),
  warmup: numberFlag(args, 'warmup', 5),
  requested: args.filter((arg) => !arg.startsWith('--')),
});

const resolveConfigurations = (requested: string[]): string[] =>
  requested.length > 0 ? requested.map((id) => findConfiguration(id).id) : CONFIGURATION_IDS;

const executeBenchmarks = async (ids: string[], runs: number, warmup: number): Promise<WorkerResult[]> => {
  const results: WorkerResult[] = [];

  for (const id of ids) {
    log(`[${id}] ${warmup} warm-up + ${runs} runs`);
    results.push(await runWorker(id, runs, warmup));
  }

  return results;
};

const resolveGasReport = async (args: string[]): Promise<{ gas: GasReport; mode: 'with-gas' | 'no-gas' }> => {
  const noGas = args.includes('--no-gas');
  const gas: GasReport = noGas
    ? {
        status: 'unavailable',
        verifyCredentialGas: null,
        note: 'Skipped (--no-gas)',
      }
    : await measureProposedModelGas();

  log(`gas: ${gas.status}${gas.verifyCredentialGas === null ? '' : ` (${gas.verifyCredentialGas})`}`);

  return { gas, mode: noGas ? 'no-gas' : 'with-gas' };
};

const buildSummary = (results: WorkerResult[], gas: GasReport) => {
  return results.map((result) => {
    const configuration = findConfiguration(result.configuration);

    return {
      configuration: configuration.id,
      label: configuration.label,
      constraints: result.constraints,
      proofBytes: result.proofBytes,
      payloadBytes: result.payloadBytes,
      peakRssMb: result.peakRssMb,
      rssBeforeSetupMb: result.rssBeforeSetupMb,
      attributesRevealed: configuration.attributesRevealed,
      issue: summarize(result.issueMs),
      prove: summarize(result.proveMs),
      verify: summarize(result.verifyMs),
      gas: configuration.id === 'B4' ? gas.verifyCredentialGas : null,
    };
  });
};

const buildReport = (reportParams: {
  runs: number;
  warmup: number;
  gas: GasReport;
  mode: 'with-gas' | 'no-gas';
  summary: ReturnType<typeof buildSummary>;
  results: WorkerResult[];
}) => ({
  experiment: 'P6 performance evaluation and ablation',
  generatedAt: new Date().toISOString(),
  mode: reportParams.mode,
  protocol: {
    runs: reportParams.runs,
    warmup: reportParams.warmup,
    isolation: 'one process per configuration',
  },
  environment: describeEnvironment(),
  gas: reportParams.gas,
  summary: reportParams.summary,
  raw: reportParams.results,
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: <>
const writeBenchmarkResults = async (
  report: ReturnType<typeof buildReport>,
  summary: ReturnType<typeof buildSummary>,
  results: WorkerResult[],
): Promise<void> => {
  const timestamp = generateTimestamp();
  const resultsDir = resolveResultsPath(REPOSITORY_ROOT, timestamp, report.mode);
  await mkdir(resultsDir, { recursive: true });

  const suffix = report.mode === 'no-gas' ? '-nogas' : '';

  await Promise.all([
    writeFile(join(resultsDir, `p6-benchmark${suffix}.json`), `${JSON.stringify(report, null, 2)}\n`),
    writeFile(
      join(resultsDir, `p6-benchmark-summary${suffix}.csv`),
      csv(
        [
          'configuration',
          'constraints',
          'proof_bytes',
          'payload_bytes',
          'peak_rss_mb',
          'prove_mean_ms',
          'prove_median_ms',
          'prove_std_ms',
          'verify_mean_ms',
          'verify_median_ms',
          'verify_std_ms',
          'gas',
          'issue_mean_ms',
          'issue_median_ms',
          'attributes_revealed',
        ],
        summary.map((row) => [
          row.configuration,
          row.constraints ?? '',
          row.proofBytes,
          row.payloadBytes,
          row.peakRssMb,
          round(row.prove.mean),
          round(row.prove.median),
          round(row.prove.std),
          round(row.verify.mean),
          round(row.verify.median),
          round(row.verify.std),
          row.gas ?? '',
          round(row.issue.mean),
          round(row.issue.median),
          row.attributesRevealed,
        ]),
      ),
    ),
    writeFile(
      join(resultsDir, `p6-benchmark-raw${suffix}.csv`),
      csv(
        ['configuration', 'run', 'issue_ms', 'prove_ms', 'verify_ms'],
        results.flatMap((result) =>
          result.proveMs.map((prove, index) => [
            result.configuration,
            index + 1,
            round(result.issueMs[index] ?? 0),
            round(prove),
            round(result.verifyMs[index] ?? 0),
          ]),
        ),
      ),
    ),
  ]);

  log(
    `wrote ${CONFIGURATIONS.length > 0 ? `experiments/results/${timestamp}/${report.mode === 'no-gas' ? 'no-gas' : 'gas'}/p6-benchmark${suffix}*.{json,csv}` : ''}`,
  );
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);

  const options = parseArguments(args);
  const ids = resolveConfigurations(options.requested);

  const results = await executeBenchmarks(ids, options.runs, options.warmup);

  const { gas, mode } = await resolveGasReport(args);
  const summary = buildSummary(results, gas);

  const report = buildReport({
    runs: options.runs,
    warmup: options.warmup,
    gas,
    mode,
    summary,
    results,
  });

  await writeBenchmarkResults(report, summary, results);
};

await main();
