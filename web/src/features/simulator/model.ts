import { atom } from 'jotai';
import { type ComparisonRow, makeRunComparison, makeStartSimulation, type SimulationHandle } from '@/application';
import {
  ABLATION_IDS,
  advance,
  type ConfigurationId,
  emptyPlayback,
  flush,
  type PlaybackMode,
  type PlaybackState,
  type RunSummary,
  receive,
  replay,
  type Scenario,
  setMode,
} from '@/domain';
import { containerOf } from '../container';

export type RunState =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly runId: string }
  | { readonly status: 'completed'; readonly summary: RunSummary }
  | { readonly status: 'error'; readonly message: string };

export const configurationAtom = atom<ConfigurationId>('B4');
export const scenarioIdAtom = atom('valid-accepted');
export const scenariosAtom = atom<readonly Scenario[]>([]);
export const playbackAtom = atom<PlaybackState>(emptyPlayback('auto'));
export const runAtom = atom<RunState>({ status: 'idle' });
export const graphAtom = atom((get) => replay(get(playbackAtom).applied));
export const compareRowsAtom = atom<readonly ComparisonRow[]>([]);
export const comparingAtom = atom(false);

const handleAtom = atom<SimulationHandle | undefined>(undefined);

export const loadScenariosAtom = atom(null, async (get, set) => {
  set(scenariosAtom, await containerOf(get).runs.scenarios());
});

export const stopRunAtom = atom(null, (get, set) => {
  get(handleAtom)?.stop();
  set(handleAtom, undefined);
  set(playbackAtom, (state) => flush(state));
  if (get(runAtom).status === 'running') set(runAtom, { status: 'idle' });
});

export const startRunAtom = atom(null, async (get, set) => {
  get(handleAtom)?.stop();
  set(playbackAtom, emptyPlayback(get(playbackAtom).mode));
  set(runAtom, { status: 'running', runId: '' });
  try {
    const handle = await makeStartSimulation(containerOf(get).runs)(
      { configuration: get(configurationAtom), scenarioId: get(scenarioIdAtom) },
      {
        onEvent: (event) => set(playbackAtom, (state) => receive(state, event)),
        onCompleted: (summary) => set(runAtom, { status: 'completed', summary }),
        onError: (message) => set(runAtom, { status: 'error', message }),
      },
    );
    set(handleAtom, handle);
    set(runAtom, (state) => (state.status === 'running' ? { status: 'running', runId: handle.runId } : state));
  } catch (error) {
    set(runAtom, { status: 'error', message: error instanceof Error ? error.message : 'Gagal memulai run' });
  }
});

export const nextStepAtom = atom(null, (_get, set) => set(playbackAtom, (state) => advance(state)));

export const setPlaybackModeAtom = atom(null, (_get, set, mode: PlaybackMode) =>
  set(playbackAtom, (state) => setMode(state, mode)),
);

export const runComparisonAtom = atom(null, async (get, set) => {
  set(compareRowsAtom, []);
  set(comparingAtom, true);
  try {
    await makeRunComparison(containerOf(get).runs)(get(scenarioIdAtom), ABLATION_IDS, (row) =>
      set(compareRowsAtom, (rows) => [...rows, row]),
    );
  } finally {
    set(comparingAtom, false);
  }
});
