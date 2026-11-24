import type { RunGateway } from '@/application';
import { isApplicable } from '@/domain';
import { MOCK_SCENARIOS } from './catalog';
import { buildRunScript } from './run-script';

export const createMockRunGateway = (): RunGateway => {
  let counter = 0;
  let active = false;
  const pending = new Map<string, { configuration: Parameters<typeof buildRunScript>[0]; scenarioId: string }>();

  return {
    scenarios: () => Promise.resolve(MOCK_SCENARIOS),

    start: ({ configuration, scenarioId }) => {
      const scenario = MOCK_SCENARIOS.find((candidate) => candidate.id === scenarioId);
      if (!scenario) return Promise.reject(new Error(`SCENARIO_UNKNOWN: ${scenarioId}`));
      if (!isApplicable(scenario, configuration)) return Promise.reject(new Error('SCENARIO_NOT_APPLICABLE'));
      if (active) return Promise.reject(new Error('RUN_IN_PROGRESS'));
      active = true;
      counter += 1;
      const runId = `mock-run-${counter}`;
      pending.set(runId, { configuration, scenarioId });
      return Promise.resolve({ runId });
    },

    subscribe: (runId, handlers) => {
      const request = pending.get(runId);
      const scenario = MOCK_SCENARIOS.find((candidate) => candidate.id === request?.scenarioId);
      if (!(request && scenario)) {
        handlers.onError('RUN_UNKNOWN');
        return () => undefined;
      }
      const script = buildRunScript(request.configuration, scenario);
      const timers: ReturnType<typeof setTimeout>[] = [];
      const total = script.events.reduce((clock, scripted, seq) => {
        const at = clock + scripted.delayMs;
        timers.push(setTimeout(() => handlers.onEvent({ ...scripted.event, runId, seq, at: Date.now() }), at));
        return at;
      }, 0);
      timers.push(
        setTimeout(() => {
          active = false;
          handlers.onCompleted({
            runId,
            configuration: request.configuration,
            scenarioId: scenario.id,
            outcome: script.outcome,
            totalMs: total,
          });
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
