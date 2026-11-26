import type { RunGateway } from '@/application';
import {
  type ConfigurationId,
  DEFAULT_REPLAY_TIMING,
  type Recording,
  type ReplayTiming,
  replayDelays,
  type Scenario,
} from '@/domain';

/** Scenarios that have a recording, each applicable only to the configurations it was recorded on. */
const recordedScenarios = (recordings: readonly Recording[]): Scenario[] => {
  const byId = recordings.reduce((map, { scenario, configuration }) => {
    const known = map.get(scenario.id);
    const configurations = [...(known?.applicableConfigurations ?? []), configuration];
    return map.set(scenario.id, { ...scenario, applicableConfigurations: configurations });
  }, new Map<string, Scenario>());
  return [...byId.values()];
};

/**
 * Plays recorded runs back as if they were live: same events, the recorded gaps between them (clamped),
 * then the recorded summary. Nothing is computed, so what is shown is exactly what the server did.
 */
export const createReplayRuns = (recordings: readonly Recording[], timing: ReplayTiming = DEFAULT_REPLAY_TIMING): RunGateway => {
  let counter = 0;
  let active = false;
  const scenarios = recordedScenarios(recordings);
  const pending = new Map<string, Recording>();
  const find = (scenarioId: string, configuration: ConfigurationId): Recording | undefined =>
    recordings.find((recording) => recording.scenario.id === scenarioId && recording.configuration === configuration);

  return {
    scenarios: () => Promise.resolve(scenarios),

    start: ({ configuration, scenarioId }) => {
      const recording = find(scenarioId, configuration);
      if (!recording) return Promise.reject(new Error('RECORDING_NOT_FOUND'));
      if (active) return Promise.reject(new Error('RUN_IN_PROGRESS'));
      active = true;
      counter += 1;
      const runId = `replay-${counter}`;
      pending.set(runId, recording);
      return Promise.resolve({ runId });
    },

    subscribe: (runId, handlers) => {
      const recording = pending.get(runId);
      if (!recording) {
        handlers.onError('RUN_UNKNOWN');
        return () => undefined;
      }
      const timers: ReturnType<typeof setTimeout>[] = [];
      const delays = replayDelays(recording.events, timing);
      const total = recording.events.reduce((clock, event, index) => {
        const at = clock + (delays[index] ?? 0);
        timers.push(setTimeout(() => handlers.onEvent({ ...event, runId }), at));
        return at;
      }, 0);
      timers.push(
        setTimeout(() => {
          active = false;
          handlers.onCompleted({ ...recording.summary, runId });
        }, total + 200),
      );
      return () => {
        timers.forEach(clearTimeout);
        active = false;
        pending.delete(runId);
      };
    },
  };
};
