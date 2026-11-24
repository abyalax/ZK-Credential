import type { ConfigurationId, RunEvent, RunSummary } from '@/domain';
import type { RunGateway, RunHandlers } from '../ports';

export interface SimulationInput {
  readonly configuration: ConfigurationId;
  readonly scenarioId: string;
}

export interface SimulationHandle {
  readonly runId: string;
  readonly stop: () => void;
}

/** Starts a run and forwards its events; the caller owns playback and rendering. */
export const makeStartSimulation =
  (runs: RunGateway) =>
  async (input: SimulationInput, handlers: RunHandlers): Promise<SimulationHandle> => {
    const { runId } = await runs.start(input);
    const stop = runs.subscribe(runId, handlers);
    return { runId, stop };
  };

export interface ComparisonRow {
  readonly configuration: ConfigurationId;
  readonly summary: RunSummary | undefined;
  readonly error: string | undefined;
}

/** Runs one scenario on each configuration, one after another (the server allows one run at a time). */
export const makeRunComparison =
  (runs: RunGateway) =>
  (
    scenarioId: string,
    configurations: readonly ConfigurationId[],
    onRow: (row: ComparisonRow) => void,
  ): Promise<readonly ComparisonRow[]> =>
    configurations.reduce<Promise<readonly ComparisonRow[]>>(
      (previous, configuration) =>
        previous.then(async (rows) => [...rows, await runOne(runs, { configuration, scenarioId }, onRow)]),
      Promise.resolve([]),
    );

const runOne = async (runs: RunGateway, input: SimulationInput, onRow: (row: ComparisonRow) => void): Promise<ComparisonRow> => {
  const row = await new Promise<ComparisonRow>((resolve) => {
    const finish = (summary: RunSummary | undefined, error: string | undefined): void =>
      resolve({ configuration: input.configuration, summary, error });
    runs
      .start(input)
      .then(({ runId }) => {
        const stop = runs.subscribe(runId, {
          onEvent: (_event: RunEvent) => undefined,
          onCompleted: (summary) => {
            stop();
            finish(summary, undefined);
          },
          onError: (message) => {
            stop();
            finish(undefined, message);
          },
        });
      })
      .catch((error: unknown) => finish(undefined, error instanceof Error ? error.message : 'Gagal memulai run'));
  });
  onRow(row);
  return row;
};
