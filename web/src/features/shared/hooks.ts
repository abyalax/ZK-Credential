import { useEffect, useState } from 'react';

/** Current time, refreshed every `intervalMs` while mounted. */
export const useNow = (intervalMs = 1000): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
};

/** Runs `callback` now and every `intervalMs`, so role pages in different browser tabs stay in step. */
export const usePolling = (callback: () => void | Promise<void>, intervalMs = 3000): void => {
  useEffect(() => {
    const run = (): void => {
      Promise.resolve(callback()).catch((error: unknown) => console.warn('Polling gagal', error));
    };
    run();
    const timer = setInterval(run, intervalMs);
    return () => clearInterval(timer);
  }, [callback, intervalMs]);
};
