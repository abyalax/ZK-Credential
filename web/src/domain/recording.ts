import { err, ok, type Result } from '@/shared';
import { CONFIGURATION_IDS, type ConfigurationId } from './configuration';
import { hasOnlyPublicData, NODE_IDS, type RunEvent, type RunSummary } from './run-event';
import type { Scenario } from './scenario';

/** One real run captured by `pnpm record:simulation` (docs/ui/contract.md, "Format rekaman"). */
export const RECORDING_VERSION = 1;

export interface Recording {
  readonly version: typeof RECORDING_VERSION;
  readonly recordedAt: string;
  readonly configuration: ConfigurationId;
  readonly scenario: Scenario;
  readonly events: readonly RunEvent[];
  readonly summary: RunSummary;
}

export interface RecordingIndexEntry {
  readonly file: string;
  readonly scenarioId: string;
  readonly configuration: ConfigurationId;
  readonly recordedAt: string;
}

export interface RecordingIndex {
  readonly version: typeof RECORDING_VERSION;
  readonly recordings: readonly RecordingIndexEntry[];
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const STATUSES: readonly unknown[] = ['started', 'completed', 'rejected'];
const isConfiguration = (value: unknown): value is ConfigurationId => (CONFIGURATION_IDS as readonly unknown[]).includes(value);

const eventProblem = (value: unknown, index: number): string | undefined => {
  if (!isObject(value)) return `events[${index}] is not an object`;
  const valid =
    typeof value.seq === 'number' &&
    typeof value.at === 'number' &&
    typeof value.runId === 'string' &&
    typeof value.step === 'string' &&
    (NODE_IDS as readonly unknown[]).includes(value.node) &&
    STATUSES.includes(value.status);
  if (!valid) return `events[${index}] is missing seq, at, runId, node, step or status`;
  return hasOnlyPublicData(value as unknown as RunEvent) ? undefined : `events[${index}] carries non-public data keys`;
};

const eventsProblem = (events: unknown): string | undefined => {
  if (!Array.isArray(events) || events.length === 0) return 'events must be a non-empty array';
  const broken = events.map((e, i) => eventProblem(e, i)).find((problem) => problem !== undefined);
  if (broken) return broken;
  const seqs = (events as RunEvent[]).map((event) => event.seq);
  return seqs.every((seq, index) => index === 0 || seq > (seqs[index - 1] ?? 0)) ? undefined : 'event seq must strictly increase';
};

const summaryProblem = (recording: Json): string | undefined => {
  const { summary, scenario, configuration, events } = recording;
  if (!(isObject(summary) && isObject(summary.outcome)))
    return 'summary with an outcome is required (the run must have completed)';
  const { outcome } = summary;
  if (typeof outcome.accepted !== 'boolean' || typeof outcome.reason !== 'string')
    return 'summary.outcome needs accepted and reason';
  if (typeof summary.totalMs !== 'number') return 'summary.totalMs must be a number';
  if (!isObject(scenario) || summary.scenarioId !== scenario.id) return 'summary.scenarioId must match scenario.id';
  if (summary.configuration !== configuration) return 'summary.configuration must match configuration';
  const runIds = new Set((events as RunEvent[]).map((event) => event.runId));
  return runIds.size === 1 && runIds.has(summary.runId as string) ? undefined : 'every event runId must equal summary.runId';
};

const scenarioProblem = (recording: Json): string | undefined => {
  const { scenario, configuration } = recording;
  if (!isObject(scenario) || typeof scenario.id !== 'string' || typeof scenario.title !== 'string')
    return 'scenario needs an id and a title';
  const applicable = scenario.applicableConfigurations;
  return Array.isArray(applicable) && applicable.includes(configuration)
    ? undefined
    : 'scenario must be applicable to the recorded configuration';
};

const headerProblem = (input: Json): string | undefined => {
  if (input.version !== RECORDING_VERSION) return `unsupported version ${String(input.version)} (expected ${RECORDING_VERSION})`;
  if (typeof input.recordedAt !== 'string' || Number.isNaN(Date.parse(input.recordedAt))) return 'recordedAt must be an ISO date';
  return isConfiguration(input.configuration) ? undefined : 'configuration must be one of A, SD, B1, B2, B3, B4';
};

/** Checks a recording file before it is trusted for replay. A broken backup must fail loudly, never play partly. */
export const parseRecording = (input: unknown): Result<Recording, string> => {
  if (!isObject(input)) return err('recording must be a JSON object');
  const problem = headerProblem(input) ?? scenarioProblem(input) ?? eventsProblem(input.events) ?? summaryProblem(input);
  return problem ? err(problem) : ok(input as unknown as Recording);
};

const entryProblem = (entry: unknown, index: number): string | undefined =>
  isObject(entry) &&
  typeof entry.file === 'string' &&
  typeof entry.scenarioId === 'string' &&
  isConfiguration(entry.configuration)
    ? undefined
    : `recordings[${index}] needs file, scenarioId and configuration`;

export const parseRecordingIndex = (input: unknown): Result<RecordingIndex, string> => {
  if (!isObject(input) || input.version !== RECORDING_VERSION || !Array.isArray(input.recordings)) {
    return err('index.json must be a version 1 recording index');
  }
  const problem = input.recordings.map((e, i) => entryProblem(e, i)).find((found) => found !== undefined);
  return problem ? err(problem) : ok(input as unknown as RecordingIndex);
};

export interface ReplayTiming {
  /** Shortest gap between two steps, so quick steps stay readable on a projector. */
  readonly minMs: number;
  /** Longest gap, so a slow step does not stall the simulation. */
  readonly maxMs: number;
}

export const DEFAULT_REPLAY_TIMING: ReplayTiming = { minMs: 250, maxMs: 1500 };

/** Delay before each event: the recorded gap to the previous event, clamped to the timing bounds. */
export const replayDelays = (events: readonly RunEvent[], timing: ReplayTiming = DEFAULT_REPLAY_TIMING): number[] =>
  events.map((event, index) => {
    const previous = events[index - 1];
    const gap = previous ? event.at - previous.at : 0;
    return Math.min(timing.maxMs, Math.max(timing.minMs, gap));
  });
