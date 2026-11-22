import type { CredentialRepository } from '../../application/index.js';
import type { CredentialId, SignedCredential } from '../../domain/index.js';
import { createSerialQueue, readJsonFile, writeJsonFile } from './json-file.js';

type Entries = Record<string, SignedCredential>;

/**
 * Credential repository backed by one JSON file, so separate CLI invocations share state.
 * Local research use only: credentials are stored unencrypted.
 */
export const createFileCredentialRepository = (path: string): CredentialRepository => {
  const serial = createSerialQueue();
  return {
    save: (credential) =>
      serial(async () => {
        const entries = await readJsonFile<Entries>(path, {});
        await writeJsonFile(path, { ...entries, [credential.credential.id]: credential });
      }),
    findById: (id: CredentialId) => serial(async () => (await readJsonFile<Entries>(path, {}))[id]),
  };
};
