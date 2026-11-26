import type { ConfigurationId, Recording, RunEvent } from '@/domain';
import { MOCK_SCENARIOS } from '@/infrastructure/mock/catalog';
import { buildRunScript } from '@/infrastructure/mock/run-script';

/** A recording shaped like `pnpm record:simulation` output, built from the mock script (test data, not a real run). */
export const makeRecording = (
  scenarioId: string,
  configuration: ConfigurationId = 'B4',
  recordedAt = '2026-11-26T08:00:00.000Z',
): Recording => {
  const scenario = MOCK_SCENARIOS.find((item) => item.id === scenarioId);
  if (!scenario) throw new Error(`unknown scenario ${scenarioId}`);
  const script = buildRunScript(configuration, scenario);
  const events: RunEvent[] = [];
  let at = 1_790_000_000_000;
  for (const [seq, { delayMs, event }] of script.events.entries()) {
    at += delayMs;
    events.push({ ...event, runId: 'recorded-run', seq, at });
  }
  return {
    version: 1,
    recordedAt,
    configuration,
    scenario: { ...scenario, applicableConfigurations: [configuration] },
    events,
    summary: { runId: 'recorded-run', configuration, scenarioId, outcome: script.outcome, totalMs: 4321 },
  };
};
