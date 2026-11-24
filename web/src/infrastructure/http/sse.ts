import type { RunHandlers } from '@/application';
import type { RunEvent, RunSummary } from '@/domain';

/**
 * `GET /api/runs/:id/events`: default messages carry a `RunEvent`, the named message
 * `run.completed` carries the `RunSummary` and ends the stream.
 */
export const subscribeToRun = (runId: string, handlers: RunHandlers): (() => void) => {
  const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`);
  let finished = false;

  const close = (): void => {
    finished = true;
    source.close();
  };

  source.onmessage = (message: MessageEvent<string>) => handlers.onEvent(JSON.parse(message.data) as RunEvent);
  source.addEventListener('run.completed', (message) => {
    handlers.onCompleted(JSON.parse((message as MessageEvent<string>).data) as RunSummary);
    close();
  });
  source.onerror = () => {
    if (finished) return;
    close();
    handlers.onError('STREAM_INTERRUPTED');
  };
  return close;
};
