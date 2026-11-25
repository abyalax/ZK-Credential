import type { ChallengeStore } from '../../application/index.js';
import type { StoredChallenge } from '../../domain/index.js';
import { createSerialQueue, readJsonFile, writeJsonFile } from './json-file.js';

type Entries = Record<string, StoredChallenge>;

/**
 * Challenge store backed by one JSON file, so `challenge` and `verify` can run as separate CLI
 * processes. `markConsumed` is atomic within one process only (serial queue); two processes
 * verifying the same proof at the same instant could both pass. Acceptable for the local
 * research setup, listed in docs/research/threats-to-validity.md.
 */
export const createFileChallengeStore = (path: string): ChallengeStore => {
  const serial = createSerialQueue();
  return {
    save: (challenge) =>
      serial(async () => {
        const entries = await readJsonFile<Entries>(path, {});
        await writeJsonFile(path, {
          ...entries,
          [challenge.value]: { challenge, consumedAt: undefined },
        });
      }),
    find: (value) => serial(async () => (await readJsonFile<Entries>(path, {}))[value]),
    list: () => serial(async () => Object.values(await readJsonFile<Entries>(path, {}))),
    markConsumed: (value, at) =>
      serial(async () => {
        const entries = await readJsonFile<Entries>(path, {});
        const entry = entries[value];
        if (!entry || entry.consumedAt !== undefined) return false;
        await writeJsonFile(path, { ...entries, [value]: { ...entry, consumedAt: at } });
        return true;
      }),
  };
};
