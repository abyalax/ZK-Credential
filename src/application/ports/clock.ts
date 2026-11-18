export interface Clock {
  /** Current time in epoch milliseconds. */
  now(): number;
}
