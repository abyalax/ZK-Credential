import type { ChallengeStore } from '../../application/index.js';
import type { ChallengeValue, StoredChallenge } from '../../domain/index.js';

export const createInMemoryChallengeStore = (): ChallengeStore => {
  const entries = new Map<ChallengeValue, StoredChallenge>();
  return {
    save: async (challenge) => {
      entries.set(challenge.value, { challenge, consumedAt: undefined });
    },
    find: async (value) => entries.get(value),
    list: async () => [...entries.values()],
    // Single-threaded read-modify-write is atomic here; a real store needs a conditional update.
    markConsumed: async (value, at) => {
      const entry = entries.get(value);
      if (!entry || entry.consumedAt !== undefined) return false;
      entries.set(value, { ...entry, consumedAt: at });
      return true;
    },
  };
};
