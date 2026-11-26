import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConfigurationId, RunEvent, RunSummary, ScenarioView } from '../src/application/index.js';
import { privateDataKeys } from '../src/application/index.js';

/**
 * Recording of one real simulation run, for the defense fallback (docs/ui/contract.md, "Format rekaman").
 * It holds exactly what the live stream carried, so replaying it shows the same events.
 */
export const RECORDING_VERSION = 1;

export interface Recording {
  readonly version: typeof RECORDING_VERSION;
  readonly recordedAt: string;
  readonly configuration: ConfigurationId;
  readonly scenario: ScenarioView;
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

export interface SseMessage {
  /** `message` for plain data, a named event (`run.completed`), or `comment` for `: ...` lines. */
  readonly event: string;
  readonly data: string;
}

const parseBlock = (block: string): SseMessage | undefined => {
  const lines = block.split(/\r?\n/).filter((line) => line !== '');
  if (lines.length === 0) return undefined;
  if (lines.every((line) => line.startsWith(':')))
    return { event: 'comment', data: lines.map((line) => line.slice(1).trim()).join(' ') };
  const field = (name: string): string[] =>
    lines.filter((line) => line.startsWith(`${name}:`)).map((line) => line.slice(name.length + 1).replace(/^ /, ''));
  return { event: field('event')[0] ?? 'message', data: field('data').join('\n') };
};

/** Incremental SSE parser: feed it text chunks of any size; it emits each complete message once. */
export const createSseParser = (onMessage: (message: SseMessage) => void): ((chunk: string) => void) => {
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const message = parseBlock(block);
      if (message) onMessage(message);
    }
  };
};

const readBody = async (body: ReadableStream<Uint8Array>, feed: (chunk: string) => void): Promise<void> => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const pump = async (): Promise<void> => {
    const { done, value } = await reader.read();
    if (done) return;
    feed(decoder.decode(value, { stream: true }));
    return pump();
  };
  await pump();
};

type FetchFn = typeof fetch;

const errorCode = async (response: Response): Promise<string> => {
  try {
    return ((await response.json()) as { error?: string }).error ?? `HTTP_${response.status}`;
  } catch {
    return `HTTP_${response.status}`;
  }
};

export const fetchScenarios = async (baseUrl: string, fetchFn: FetchFn = fetch): Promise<readonly ScenarioView[]> => {
  const response = await fetchFn(`${baseUrl}/api/scenarios`);
  if (!response.ok) throw new Error(`GET /api/scenarios failed: ${await errorCode(response)}`);
  return (await response.json()) as ScenarioView[];
};

interface Collected {
  readonly events: Map<number, RunEvent>;
  summary: RunSummary | undefined;
  note: string | undefined;
}

const collect = (): { collected: Collected; feed: (chunk: string) => void } => {
  const collected: Collected = { events: new Map(), summary: undefined, note: undefined };
  const feed = createSseParser((message) => {
    if (message.event === 'run.completed') collected.summary = JSON.parse(message.data) as RunSummary;
    else if (message.event === 'comment') collected.note = message.data;
    else {
      const event = JSON.parse(message.data) as RunEvent;
      collected.events.set(event.seq, event);
    }
  });
  return { collected, feed };
};

export interface RecordOptions {
  readonly baseUrl: string;
  readonly scenario: ScenarioView;
  readonly configuration: ConfigurationId;
  readonly fetchFn?: FetchFn;
  readonly now?: () => Date;
}

const startRun = async (options: RecordOptions): Promise<string> => {
  const { baseUrl, scenario, configuration, fetchFn = fetch } = options;
  const response = await fetchFn(`${baseUrl}/api/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configuration, scenarioId: scenario.id }),
  });
  if (!response.ok) throw new Error(`POST /api/runs failed for ${scenario.id}: ${await errorCode(response)}`);
  return ((await response.json()) as { runId: string }).runId;
};

const assertPublic = (events: readonly RunEvent[]): void => {
  const leaked = events.flatMap((event) => privateDataKeys(event.data).map((key) => `${event.step}.${key}`));
  if (leaked.length > 0) throw new Error(`Refusing to record non-public event data: ${leaked.join(', ')}`);
};

/** Runs one scenario on the live server and captures the whole event stream and its closing summary. */
export const recordScenario = async (options: RecordOptions): Promise<Recording> => {
  const { baseUrl, scenario, configuration, fetchFn = fetch, now = () => new Date() } = options;
  const runId = await startRun(options);
  const response = await fetchFn(`${baseUrl}/api/runs/${encodeURIComponent(runId)}/events`, {
    headers: { Accept: 'text/event-stream' },
  });
  if (!(response.ok && response.body)) throw new Error(`GET /api/runs/${runId}/events failed: ${await errorCode(response)}`);
  const { collected, feed } = collect();
  await readBody(response.body, feed);
  if (!collected.summary) {
    throw new Error(`RUN_INTERRUPTED: ${scenario.id} ended before run.completed${collected.note ? ` (${collected.note})` : ''}`);
  }
  const events = [...collected.events.values()].sort((a, b) => a.seq - b.seq);
  if (events.length === 0) throw new Error(`Run ${runId} of ${scenario.id} produced no events`);
  assertPublic(events);
  return {
    version: RECORDING_VERSION,
    recordedAt: now().toISOString(),
    configuration,
    scenario,
    events,
    summary: collected.summary,
  };
};

export const recordingFileName = (recording: Pick<Recording, 'scenario' | 'configuration'>): string =>
  `${recording.scenario.id}.${recording.configuration}.json`;

/** A new entry replaces the old one for the same scenario and configuration; other entries stay. */
export const mergeIndex = (existing: RecordingIndex | undefined, entries: readonly RecordingIndexEntry[]): RecordingIndex => {
  const replaced = (entry: RecordingIndexEntry): boolean =>
    entries.some((next) => next.scenarioId === entry.scenarioId && next.configuration === entry.configuration);
  const kept = (existing?.recordings ?? []).filter((entry) => !replaced(entry));
  return { version: RECORDING_VERSION, recordings: [...kept, ...entries].sort((a, b) => a.file.localeCompare(b.file)) };
};

const readIndex = async (file: string): Promise<RecordingIndex | undefined> => {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return undefined;
  }
  const parsed = JSON.parse(text) as Partial<RecordingIndex>;
  if (parsed.version !== RECORDING_VERSION || !Array.isArray(parsed.recordings)) {
    throw new Error(`${file} is not a version ${RECORDING_VERSION} recording index; move it away or fix it before recording`);
  }
  return parsed as RecordingIndex;
};

export const writeRecordings = async (dir: string, recordings: readonly Recording[]): Promise<RecordingIndex> => {
  await mkdir(dir, { recursive: true });
  const indexFile = join(dir, 'index.json');
  const existing = await readIndex(indexFile);
  await Promise.all(
    recordings.map((recording) => writeFile(join(dir, recordingFileName(recording)), `${JSON.stringify(recording, null, 2)}\n`)),
  );
  const entries = recordings.map((recording) => ({
    file: recordingFileName(recording),
    scenarioId: recording.scenario.id,
    configuration: recording.configuration,
    recordedAt: recording.recordedAt,
  }));
  const index = mergeIndex(existing, entries);
  await writeFile(indexFile, `${JSON.stringify(index, null, 2)}\n`);
  return index;
};

const pick = (scenarios: readonly ScenarioView[], id: string, configuration: ConfigurationId): ScenarioView => {
  const scenario = scenarios.find((candidate) => candidate.id === id);
  if (!scenario) throw new Error(`Unknown scenario "${id}". Served: ${scenarios.map((candidate) => candidate.id).join(', ')}`);
  if (!scenario.applicableConfigurations.includes(configuration)) {
    throw new Error(
      `Scenario "${id}" cannot run on ${configuration} on this server (applicable: ${scenario.applicableConfigurations.join(', ') || 'none'})`,
    );
  }
  return scenario;
};

export interface RecordAllOptions {
  readonly baseUrl: string;
  readonly scenarioIds: readonly string[];
  readonly configuration: ConfigurationId;
  readonly fetchFn?: FetchFn;
  readonly now?: () => Date;
}

/** Records the scenarios one after another: the server runs a single simulation at a time. */
export const recordAll = async (options: RecordAllOptions): Promise<readonly Recording[]> => {
  const { baseUrl, scenarioIds, configuration, fetchFn, now } = options;
  const scenarios = await fetchScenarios(baseUrl, fetchFn);
  const chosen = scenarioIds.map((id) => pick(scenarios, id, configuration));
  return chosen.reduce<Promise<readonly Recording[]>>(
    (previous, scenario) =>
      previous.then(async (done) => [
        ...done,
        await recordScenario({ baseUrl, scenario, configuration, ...(fetchFn ? { fetchFn } : {}), ...(now ? { now } : {}) }),
      ]),
    Promise.resolve([]),
  );
};
