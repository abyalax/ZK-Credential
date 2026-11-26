import { describe, expect, it } from 'vitest';
import { DEFAULT_REPLAY_TIMING, parseRecording, parseRecordingIndex, type RunEvent, replayDelays } from '@/domain';
import { must } from './support/must';
import { makeRecording } from './support/recordings';

const withChange = (change: (draft: Record<string, unknown>) => void) => {
  const draft = structuredClone(makeRecording('valid-accepted')) as unknown as Record<string, unknown>;
  change(draft);
  return parseRecording(draft);
};

describe('parseRecording', () => {
  it('accepts a well-formed recording, both a normal flow and a rejected attack', () => {
    expect(parseRecording(makeRecording('valid-accepted')).ok).toBe(true);
    expect(parseRecording(makeRecording('replay-same-proof')).ok).toBe(true);
  });

  it.each([
    ['not an object', () => parseRecording('x'), /JSON object/],
    ['an unknown version', () => withChange((r) => (r.version = 2)), /unsupported version 2/],
    ['an invalid date', () => withChange((r) => (r.recordedAt = 'yesterday')), /recordedAt/],
    ['an unknown configuration', () => withChange((r) => (r.configuration = 'B9')), /configuration must be one of/],
    [
      'a scenario that does not run on that configuration',
      () => withChange((r) => ((r.scenario as { applicableConfigurations: string[] }).applicableConfigurations = ['B1'])),
      /applicable/,
    ],
    ['no events', () => withChange((r) => (r.events = [])), /non-empty/],
    ['a run that never completed (no summary)', () => withChange((r) => delete r.summary), /summary/],
    [
      'a summary of another scenario',
      () => withChange((r) => ((r.summary as { scenarioId: string }).scenarioId = 'other')),
      /scenarioId/,
    ],
    [
      'events of another run',
      () => withChange((r) => ((r.events as RunEvent[])[0] = { ...must((r.events as RunEvent[])[0]), runId: 'other' })),
      /runId/,
    ],
  ])('rejects %s', (_name, parse, message) => {
    const result = parse();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(message);
  });

  it('rejects an event that carries a non-public key, so a leaked secret never plays', () => {
    const result = withChange((r) => {
      const [first, ...rest] = r.events as RunEvent[];
      r.events = [{ ...must(first), data: { holderPrivateKey: 'x' } }, ...rest];
    });
    expect(result).toEqual({ ok: false, error: 'events[0] carries non-public data keys' });
  });

  it('rejects events whose seq does not strictly increase', () => {
    const result = withChange((r) => {
      const events = r.events as RunEvent[];
      r.events = [must(events[1]), must(events[0]), ...events.slice(2)];
    });
    expect(result).toEqual({ ok: false, error: 'event seq must strictly increase' });
  });
});

describe('parseRecordingIndex', () => {
  it('accepts a version 1 index and rejects anything else', () => {
    const entry = { file: 'a.B4.json', scenarioId: 'a', configuration: 'B4', recordedAt: '2026-11-26T08:00:00.000Z' };
    expect(parseRecordingIndex({ version: 1, recordings: [entry] }).ok).toBe(true);
    expect(parseRecordingIndex({ version: 2, recordings: [] }).ok).toBe(false);
    expect(parseRecordingIndex({ version: 1, recordings: [{ file: 'a.json' }] }).ok).toBe(false);
  });
});

describe('replayDelays', () => {
  const at = (...times: number[]): RunEvent[] =>
    times.map((time, seq) => ({ runId: 'r', seq, node: 'holder', step: 's', status: 'completed', at: time }));

  it('keeps the recorded gap between events, clamped to the timing bounds', () => {
    const { minMs, maxMs } = DEFAULT_REPLAY_TIMING;
    expect(replayDelays(at(0, 10, 10 + 700, 10 + 700 + 60_000))).toEqual([minMs, minMs, 700, maxMs]);
  });

  it('never goes below the minimum for the first event or for events recorded in the same instant', () => {
    expect(replayDelays(at(5, 5), { minMs: 100, maxMs: 200 })).toEqual([100, 100]);
  });
});
