import type { RunEvent, RunSummary } from '../../../application/index.js';
import type { Result } from '../../../shared/index.js';
import { err, ok } from '../../../shared/index.js';
import type { ErrorLogger } from '../http-error.js';

export type StreamMessage =
  | { readonly kind: 'event'; readonly event: RunEvent }
  | { readonly kind: 'completed'; readonly summary: RunSummary }
  /** The run crashed before `run.completed`; the stream ends and the client reports `STREAM_INTERRUPTED`. */
  | { readonly kind: 'failed' };

type Listener = (message: StreamMessage) => void;

interface RunRecord {
  readonly events: RunEvent[];
  readonly listeners: Set<Listener>;
  closing: StreamMessage | undefined;
}

export type RunExecutor = (run: { readonly runId: string; readonly emit: (event: RunEvent) => void }) => Promise<RunSummary>;

const KEPT_RUNS = 20;

/**
 * In-memory home of demo runs: one at a time, and the events of recent runs are kept so a client that
 * connects late is replayed from `seq = 0`. Nothing here knows about HTTP.
 */
export const createRunRegistry = (logger: ErrorLogger) => {
  const records = new Map<string, RunRecord>();
  let counter = 0;
  let running: Promise<void> = Promise.resolve();
  let busy = false;

  const broadcast = (record: RunRecord, message: StreamMessage): void => {
    if (message.kind === 'event') record.events.push(message.event);
    else record.closing = message;
    for (const listener of record.listeners) listener(message);
    if (message.kind !== 'event') record.listeners.clear();
  };

  const execute = async (runId: string, record: RunRecord, executor: RunExecutor): Promise<void> => {
    try {
      const summary = await executor({ runId, emit: (event) => broadcast(record, { kind: 'event', event }) });
      broadcast(record, { kind: 'completed', summary });
    } catch (error) {
      logger.error(`Run ${runId} failed`, error);
      broadcast(record, { kind: 'failed' });
    } finally {
      busy = false;
    }
  };

  const evictOld = (): void => {
    for (const id of [...records.keys()].slice(0, Math.max(0, records.size - KEPT_RUNS))) records.delete(id);
  };

  return {
    /** Starts `executor` in the background. Refuses while another run is still going. */
    start(executor: RunExecutor): Result<string, 'RUN_IN_PROGRESS'> {
      if (busy) return err('RUN_IN_PROGRESS');
      busy = true;
      counter += 1;
      const runId = `r${counter}`;
      const record: RunRecord = { events: [], listeners: new Set(), closing: undefined };
      records.set(runId, record);
      evictOld();
      running = execute(runId, record, executor);
      return ok(runId);
    },
    has: (runId: string): boolean => records.has(runId),
    /** Replays what the run has emitted so far, then follows it. Returns the unsubscribe function. */
    subscribe(runId: string, listener: Listener): () => void {
      const record = records.get(runId);
      if (!record) return () => undefined;
      for (const event of record.events) listener({ kind: 'event', event });
      if (record.closing) {
        listener(record.closing);
        return () => undefined;
      }
      record.listeners.add(listener);
      return () => record.listeners.delete(listener);
    },
    /** Resolves when the current run has finished (tests and graceful shutdown). */
    idle: (): Promise<void> => running,
  };
};

export type RunRegistry = ReturnType<typeof createRunRegistry>;
