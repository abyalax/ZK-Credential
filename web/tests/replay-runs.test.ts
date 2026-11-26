import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunHandlers } from '@/application';
import type { RunEvent, RunSummary } from '@/domain';
import { createReplayContainer } from '@/infrastructure';
import { loadRecordings } from '@/infrastructure/recorded/load-recordings';
import { createReplayRuns } from '@/infrastructure/recorded/replay-runs';
import { must } from './support/must';
import { makeRecording } from './support/recordings';

const recordings = [makeRecording('valid-accepted'), makeRecording('replay-same-proof')];

const collect = () => {
  const events: RunEvent[] = [];
  const completed: RunSummary[] = [];
  const errors: string[] = [];
  const handlers: RunHandlers = {
    onEvent: (e) => events.push(e),
    onCompleted: (s) => completed.push(s),
    onError: (m) => errors.push(m),
  };
  return { events, completed, errors, handlers };
};

describe('replay gateway', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('lists only recorded scenarios, applicable only to the configuration they were recorded on', async () => {
    const scenarios = await createReplayRuns(recordings).scenarios();
    expect(scenarios.map((s) => s.id).sort()).toEqual(['replay-same-proof', 'valid-accepted']);
    expect(scenarios.every((s) => s.applicableConfigurations.join() === 'B4')).toBe(true);
  });

  it('merges the configurations of one scenario recorded more than once', async () => {
    const both = [makeRecording('valid-accepted', 'B4'), makeRecording('valid-accepted', 'B3')];
    const [scenario] = await createReplayRuns(both).scenarios();
    expect(scenario?.applicableConfigurations).toEqual(['B4', 'B3']);
  });

  it('replays the recorded events in order under a fresh run id, then the recorded summary', async () => {
    const runs = createReplayRuns(recordings);
    const { runId } = await runs.start({ configuration: 'B4', scenarioId: 'replay-same-proof' });
    const seen = collect();
    runs.subscribe(runId, seen.handlers);

    await vi.runAllTimersAsync();

    const recorded = must(recordings[1]);
    expect(runId).toBe('replay-1');
    expect(seen.events.map((e) => e.seq)).toEqual(recorded.events.map((e) => e.seq));
    expect(seen.events.every((e) => e.runId === runId)).toBe(true);
    expect(seen.events.map(({ runId: _ignored, ...rest }) => rest)).toEqual(
      recorded.events.map(({ runId: _also, ...rest }) => rest),
    );
    expect(seen.completed).toEqual([{ ...recorded.summary, runId }]);
    expect(seen.completed[0]?.outcome.reason).toBe('CHALLENGE_ALREADY_USED');
  });

  it('paces the replay with the recorded gaps instead of dumping everything at once', async () => {
    const runs = createReplayRuns(recordings);
    const { runId } = await runs.start({ configuration: 'B4', scenarioId: 'valid-accepted' });
    const seen = collect();
    runs.subscribe(runId, seen.handlers);

    await vi.advanceTimersByTimeAsync(100);
    expect(seen.events).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(400);
    expect(seen.events.length).toBeGreaterThan(0);
    expect(seen.events.length).toBeLessThan(must(recordings[0]).events.length);
  });
});

describe('replay gateway run slot and cancellation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('allows one run at a time, like the server, and a new run after the last one completed', async () => {
    const runs = createReplayRuns(recordings);
    const first = await runs.start({ configuration: 'B4', scenarioId: 'valid-accepted' });
    await expect(runs.start({ configuration: 'B4', scenarioId: 'valid-accepted' })).rejects.toThrow('RUN_IN_PROGRESS');

    runs.subscribe(first.runId, collect().handlers);
    await vi.runAllTimersAsync();
    await expect(runs.start({ configuration: 'B4', scenarioId: 'valid-accepted' })).resolves.toEqual({ runId: 'replay-2' });
  });

  it('refuses a scenario or configuration that was not recorded', async () => {
    const runs = createReplayRuns(recordings);
    await expect(runs.start({ configuration: 'B4', scenarioId: 'gpa-below-threshold' })).rejects.toThrow('RECORDING_NOT_FOUND');
    await expect(runs.start({ configuration: 'B1', scenarioId: 'valid-accepted' })).rejects.toThrow('RECORDING_NOT_FOUND');
  });

  it('stops delivering when the subscriber unsubscribes, and frees the run slot', async () => {
    const runs = createReplayRuns(recordings);
    const { runId } = await runs.start({ configuration: 'B4', scenarioId: 'valid-accepted' });
    const seen = collect();
    const stop = runs.subscribe(runId, seen.handlers);
    await vi.advanceTimersByTimeAsync(300);
    stop();
    const delivered = seen.events.length;
    await vi.runAllTimersAsync();
    expect(seen.events).toHaveLength(delivered);
    expect(seen.completed).toEqual([]);
    await expect(runs.start({ configuration: 'B4', scenarioId: 'valid-accepted' })).resolves.toBeDefined();
  });

  it('reports an unknown run id through onError', () => {
    const seen = collect();
    createReplayRuns(recordings).subscribe('nope', seen.handlers);
    expect(seen.errors).toEqual(['RUN_UNKNOWN']);
  });
});

describe('replay container', () => {
  it('serves the simulator only and reports when the newest recording was made', async () => {
    const container = createReplayContainer([
      makeRecording('valid-accepted', 'B4', '2026-11-20T08:00:00.000Z'),
      makeRecording('replay-same-proof', 'B4', '2026-11-26T08:00:00.000Z'),
    ]);
    expect(container.mode).toBe('replay');
    expect(container.recordedAt).toBe('2026-11-26T08:00:00.000Z');
    await expect(container.issuer.profile()).rejects.toThrow('REPLAY_MODE');
    await expect(container.verifier.challenges()).rejects.toThrow('REPLAY_MODE');
    await expect(container.holder.credentials()).rejects.toThrow('REPLAY_MODE');
    expect((await container.runs.scenarios()).length).toBe(2);
  });
});

describe('loadRecordings', () => {
  const entry = (r: ReturnType<typeof makeRecording>) => ({
    file: `${r.scenario.id}.${r.configuration}.json`,
    scenarioId: r.scenario.id,
    configuration: r.configuration,
    recordedAt: r.recordedAt,
  });
  const serve = (files: Record<string, unknown>): typeof fetch =>
    (async (input: string | URL | Request) => {
      const body = files[String(input)];
      return body === undefined ? new Response('<!doctype html>', { status: 200 }) : Response.json(body);
    }) as typeof fetch;

  it('loads every recording listed in the index', async () => {
    const [a, b] = recordings as [(typeof recordings)[number], (typeof recordings)[number]];
    const fetchFn = serve({
      '/recordings/index.json': { version: 1, recordings: [entry(a), entry(b)] },
      [`/recordings/${entry(a).file}`]: a,
      [`/recordings/${entry(b).file}`]: b,
    });
    const loaded = await loadRecordings('/recordings', fetchFn);
    expect(loaded.map((r) => r.scenario.id)).toEqual(['valid-accepted', 'replay-same-proof']);
  });

  it('says the recordings are missing when the server answers with HTML (Vite SPA fallback) or 404', async () => {
    await expect(loadRecordings('/recordings', serve({}))).rejects.toThrow(/RECORDINGS_NOT_FOUND/);
    await expect(loadRecordings('/recordings', (async () => new Response('', { status: 404 })) as typeof fetch)).rejects.toThrow(
      /RECORDINGS_NOT_FOUND/,
    );
  });

  it('fails the whole load when one recording is invalid, naming the file', async () => {
    const [a] = recordings as [(typeof recordings)[number]];
    const fetchFn = serve({
      '/recordings/index.json': { version: 1, recordings: [entry(a)] },
      [`/recordings/${entry(a).file}`]: { ...a, version: 7 },
    });
    await expect(loadRecordings('/recordings', fetchFn)).rejects.toThrow(
      /RECORDING_INVALID: valid-accepted\.B4\.json: unsupported version 7/,
    );
  });

  it('refuses an empty index', async () => {
    await expect(
      loadRecordings('/recordings', serve({ '/recordings/index.json': { version: 1, recordings: [] } })),
    ).rejects.toThrow(/RECORDINGS_EMPTY/);
  });
});
