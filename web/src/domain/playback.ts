import type { RunEvent } from './run-event';
import { orderBySeq } from './run-event';

export type PlaybackMode = 'auto' | 'step';

/** Events received but not yet shown (`pending`) and events already applied to the graph (`applied`). */
export interface PlaybackState {
  readonly mode: PlaybackMode;
  readonly applied: readonly RunEvent[];
  readonly pending: readonly RunEvent[];
}

export const emptyPlayback = (mode: PlaybackMode): PlaybackState => ({ mode, applied: [], pending: [] });

const seen = (state: PlaybackState, event: RunEvent): boolean =>
  [...state.applied, ...state.pending].some((known) => known.seq === event.seq);

/** Auto mode shows an event at once; step mode holds it until `advance`. A `seq` seen before is dropped (stream replays). */
export const receive = (state: PlaybackState, event: RunEvent): PlaybackState =>
  seen(state, event)
    ? state
    : state.mode === 'auto'
      ? { ...state, applied: orderBySeq([...state.applied, event]) }
      : { ...state, pending: orderBySeq([...state.pending, event]) };

export const advance = (state: PlaybackState): PlaybackState => {
  const [next, ...rest] = state.pending;
  return next ? { ...state, applied: [...state.applied, next], pending: rest } : state;
};

export const flush = (state: PlaybackState): PlaybackState => ({
  ...state,
  applied: [...state.applied, ...state.pending],
  pending: [],
});

export const setMode = (state: PlaybackState, mode: PlaybackMode): PlaybackState =>
  mode === 'auto' ? { ...flush(state), mode } : { ...state, mode };
