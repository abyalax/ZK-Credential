export interface Summary {
  readonly n: number;
  readonly mean: number;
  readonly median: number;
  /** Sample standard deviation (n - 1); 0 when there is a single value. */
  readonly std: number;
  readonly min: number;
  readonly max: number;
}

export const summarize = (values: readonly number[]): Summary => {
  if (values.length === 0) throw new RangeError('Cannot summarize an empty sample');
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / n;
  const middle = Math.floor(n / 2);
  const median =
    n % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : (sorted[middle] ?? 0);
  const variance =
    n > 1 ? sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1) : 0;
  return {
    n,
    mean,
    median,
    std: Math.sqrt(variance),
    min: sorted[0] ?? 0,
    max: sorted[n - 1] ?? 0,
  };
};
