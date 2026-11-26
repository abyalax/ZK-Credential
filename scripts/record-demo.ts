/**
 * Records real simulation runs for the defense fallback (docs/ui/walkthrough.md, "Cadangan sidang").
 * Prerequisite: the simulation server is running (`pnpm serve`, see docs/ui/server.md).
 *
 * Usage: pnpm record:simulation [--scenario=valid-accepted,replay-same-proof] [--configuration=B4]
 *                         [--url=http://127.0.0.1:8787] [--out=web/public/recordings]
 * Output: <out>/<scenario>.<configuration>.json and <out>/index.json (merged with what is already there).
 */
import { join } from 'node:path';
import { CONFIGURATION_IDS, type ConfigurationId } from '../src/application/index.js';
import { REPOSITORY_ROOT } from '../src/infrastructure/proof-system/artifact-paths.js';
import { DEFAULT_HTTP_PORT } from '../src/interfaces/http/index.js';
import { recordAll, writeRecordings } from './record-simulation-lib.js';

const flag = (name: string): string | undefined =>
  process.argv
    .slice(2)
    .find((argument) => argument.startsWith(`--${name}=`))
    ?.slice(name.length + 3);

const configurationFlag = (): ConfigurationId => {
  const value = flag('configuration') ?? 'B4';
  if (!(CONFIGURATION_IDS as readonly string[]).includes(value)) {
    throw new Error(`--configuration must be one of ${CONFIGURATION_IDS.join(', ')}`);
  }
  return value as ConfigurationId;
};

const main = async (): Promise<void> => {
  const baseUrl = flag('url') ?? `http://127.0.0.1:${process.env.ZK_HTTP_PORT?.trim() || DEFAULT_HTTP_PORT}`;
  const outDir = flag('out') ?? join(REPOSITORY_ROOT, 'web', 'public', 'recordings');
  const scenarioIds = (flag('scenario') ?? 'valid-accepted,replay-same-proof')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  console.log(`Recording ${scenarioIds.join(', ')} from ${baseUrl} ...`);
  const recordings = await recordAll({ baseUrl, scenarioIds, configuration: configurationFlag() });
  await writeRecordings(outDir, recordings);
  for (const { scenario, configuration, events, summary } of recordings) {
    console.log(`  ${scenario.id} (${configuration}): ${summary.outcome.reason}, ${events.length} events, ${summary.totalMs} ms`);
  }
  console.log(`Wrote ${recordings.length} recording(s) to ${outDir}`);
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`record:simulation failed: ${message}`);
  if (/fetch failed|ECONNREFUSED/.test(`${message} ${(error as { cause?: { code?: string } }).cause?.code ?? ''}`)) {
    console.error('Is the simulation server running? Start it with `pnpm serve`.');
  }
  process.exitCode = 1;
});
