/**
 * P5.2: runs every attack scenario against every circuit variant (configuration) with real
 * proofs, then writes structured results to experiments/results/.
 *
 * Usage: pnpm experiment:p5 [variant ...]   (needs `pnpm setup:zk`; the script runs it first)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPOSITORY_ROOT } from '../../src/infrastructure/index.js';
import { SCENARIOS } from './catalog.js';
import { createScenarioContext } from './context.js';
import { resultsToCsv, summarize, summaryToCsv } from './metrics.js';
import {
  expectedAcceptance,
  type ScenarioResult,
  VARIANT_NAMES,
  type VariantName,
} from './types.js';
import { generateTimestamp, resolveScenariosPath } from '../results-utils.js';

const RESULTS_DIR = join(REPOSITORY_ROOT, 'experiments', 'results');

const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const parseVariants = (args: readonly string[]): readonly VariantName[] => {
  if (args.length === 0) return VARIANT_NAMES;
  const unknown = args.filter((arg) => !(VARIANT_NAMES as readonly string[]).includes(arg));
  if (unknown.length > 0) throw new Error(`Unknown variant(s): ${unknown.join(', ')}`);
  return args as VariantName[];
};

const runVariant = async (variant: VariantName): Promise<ScenarioResult[]> => {
  const ctx = await createScenarioContext(variant);
  const results: ScenarioResult[] = [];
  try {
    for (const scenario of SCENARIOS) {
      const started = performance.now();
      const outcome = await scenario.run(ctx);
      const durationMs = Math.round(performance.now() - started);
      results.push({
        configuration: variant,
        scenarioId: scenario.id,
        kind: scenario.kind,
        category: scenario.category,
        expectedAccepted: expectedAcceptance(scenario, variant),
        accepted: outcome.accepted,
        stage: outcome.stage,
        reason: outcome.reason,
        durationMs,
      });
      log(`[${variant}] ${scenario.id}: ${outcome.reason} (${durationMs} ms)`);
    }
  } finally {
    await ctx.close();
  }
  return results;
};

const main = async (): Promise<void> => {
  const variants = parseVariants(process.argv.slice(2));
  const results: ScenarioResult[] = [];
  for (const variant of variants) results.push(...(await runVariant(variant)));

  const summary = summarize(results);

  const timestamp = generateTimestamp();
  const resultsDir = resolveScenariosPath(REPOSITORY_ROOT, timestamp);
  await mkdir(resultsDir, { recursive: true });

  const report = {
    experiment: 'P5 attack-scenario testing',
    generatedAt: new Date().toISOString(),
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    summary,
    results,
  };
  await Promise.all([
    writeFile(join(resultsDir, 'p5-attack-scenarios.json'), `${JSON.stringify(report, null, 2)}\n`),
    writeFile(join(resultsDir, 'p5-attack-scenarios.csv'), resultsToCsv(results)),
    writeFile(join(resultsDir, 'p5-summary.csv'), summaryToCsv(summary)),
  ]);
  log(`wrote experiments/results/${timestamp}/scenarios/p5-attack-scenarios.*`);
  log(summaryToCsv(summary));

  if (summary.some((row) => row.unexpected.length > 0)) {
    process.exitCode = 1;
    log('Some scenarios differ from their expected outcome; see the "unexpected" column.');
  }
};

await main();
