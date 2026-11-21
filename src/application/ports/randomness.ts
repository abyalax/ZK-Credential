export interface Randomness {
  /** Cryptographically secure random bytes encoded as lowercase hex (2 chars per byte). */
  hex: (bytes: number) => string;
}
