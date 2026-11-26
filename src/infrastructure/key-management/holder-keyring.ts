import type { HolderKeyring } from '../../application/index.js';
import type { HolderKeys } from '../../domain/index.js';
import { asHolderPrivateKey, asHolderPublicKey } from '../../domain/index.js';
import { generateHolderKeyPair } from '../cryptography/index.js';
import { createSerialQueue, readJsonFile, writeJsonFile } from '../persistence/json-file.js';

const freshKeys = async (): Promise<HolderKeys> => {
  const pair = await generateHolderKeyPair();
  // `privateKey` is non-enumerable on the pair, so copy it explicitly.
  return { publicKey: pair.publicKey, privateKey: pair.privateKey };
};

/** Keeps the simulation holder key in memory only; a restart creates a new holder. */
export const createInMemoryHolderKeyring = (): HolderKeyring => {
  let current: Promise<HolderKeys> | undefined;
  return {
    current: () => {
      current ??= freshKeys();
      return current;
    },
    generate: freshKeys,
  };
};

interface StoredKeys {
  readonly publicKey?: string;
  readonly privateKey?: string;
}

/**
 * Keeps the simulation holder key in one JSON file with the same shape as the CLI's `holder.json`, so the
 * CLI and the HTTP server act as the same holder. Local research use only: the key is stored unencrypted.
 */
export const createFileHolderKeyring = (path: string): HolderKeyring => {
  const serial = createSerialQueue();
  return {
    current: () =>
      serial(async () => {
        const stored = await readJsonFile<StoredKeys | undefined>(path, undefined);
        if (stored?.publicKey && stored.privateKey) {
          return { publicKey: asHolderPublicKey(stored.publicKey), privateKey: asHolderPrivateKey(stored.privateKey) };
        }
        const keys = await freshKeys();
        await writeJsonFile(path, keys);
        return keys;
      }),
    generate: freshKeys,
  };
};
