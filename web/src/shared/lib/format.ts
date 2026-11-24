/** GPA is an integer scaled by 100 (350 = 3.50), the same encoding as the circuit. */
export const formatGpa = (scaled: number): string => (scaled / 100).toFixed(2);

export const parseGpa = (text: string): number | undefined => {
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) ? Math.round(value * 100) : undefined;
};

export const formatMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);

export const shorten = (value: string, head = 8, tail = 6): string =>
  value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;

export const formatCountdown = (remainingMs: number): string => {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
};
