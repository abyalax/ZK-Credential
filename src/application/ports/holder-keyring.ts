import type { HolderKeys } from '../../domain/index.js';

/**
 * Holder keys for the demo server, where one holder lives inside the process (docs/architecture/ui-demo.md).
 * A real holder keeps its own key; this port exists only so the server never reads key files itself.
 */
export interface HolderKeyring {
  /** The demo holder's key pair. Created on first use and the same on every later call. */
  current: () => Promise<HolderKeys>;
  /** A throwaway key pair that never becomes `current` (stands in for an attacker's key). */
  generate: () => Promise<HolderKeys>;
}
