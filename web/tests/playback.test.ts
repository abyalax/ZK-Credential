import { describe, expect, it } from 'vitest';
import { advance, emptyPlayback, flush, type RunEvent, receive, setMode } from '@/domain';

const event = (seq: number): RunEvent => ({
  runId: 'r',
  seq,
  node: 'holder',
  step: 'proof.generated',
  status: 'completed',
  at: 0,
});

describe('playback', () => {
  it('shows events at once in auto mode, ordered by seq', () => {
    const state = [event(1), event(0)].reduce(receive, emptyPlayback('auto'));
    expect(state.applied.map((e) => e.seq)).toEqual([0, 1]);
    expect(state.pending).toEqual([]);
  });

  it('holds events in step mode until advance', () => {
    let state = [event(0), event(1)].reduce(receive, emptyPlayback('step'));
    expect(state.applied).toEqual([]);
    state = advance(state);
    expect(state.applied.map((e) => e.seq)).toEqual([0]);
    expect(state.pending.map((e) => e.seq)).toEqual([1]);
  });

  it('drops an event whose seq was already received', () => {
    const state = [event(0), event(0), event(1)].reduce(receive, emptyPlayback('auto'));
    expect(state.applied.map((e) => e.seq)).toEqual([0, 1]);
  });

  it('advance on an empty queue changes nothing', () => {
    const state = emptyPlayback('step');
    expect(advance(state)).toBe(state);
  });

  it('flushes pending events when switching to auto', () => {
    const state = setMode([event(0), event(1)].reduce(receive, emptyPlayback('step')), 'auto');
    expect(state.mode).toBe('auto');
    expect(state.applied).toHaveLength(2);
    expect(state.pending).toEqual([]);
  });

  it('flush applies everything that is pending', () => {
    expect(flush([event(0)].reduce(receive, emptyPlayback('step'))).applied).toHaveLength(1);
  });
});
