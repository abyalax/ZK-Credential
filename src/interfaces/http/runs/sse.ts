import type { Response } from 'express';
import type { StreamMessage } from './run-registry.js';

export const openEventStream = (res: Response): void => {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Stops reverse proxies from buffering the stream.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
};

/** Plain messages carry a `RunEvent`; the named message `run.completed` carries the `RunSummary` and ends the stream. */
export const formatMessage = (message: StreamMessage): string => {
  if (message.kind === 'event') return `data: ${JSON.stringify(message.event)}\n\n`;
  if (message.kind === 'completed') return `event: run.completed\ndata: ${JSON.stringify(message.summary)}\n\n`;
  return ': run failed\n\n';
};
