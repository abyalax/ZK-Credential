/** Unwraps a value a test expects to exist, failing with a clear message instead of a non-null assertion. */
export const must = <T>(value: T | undefined, what = 'value'): T => {
  if (value === undefined) throw new Error(`test expected ${what} to exist`);
  return value;
};
