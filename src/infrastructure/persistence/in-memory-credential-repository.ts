import type { CredentialRepository } from '../../application/index.js';
import type { CredentialId, SignedCredential } from '../../domain/index.js';

export const createInMemoryCredentialRepository = (): CredentialRepository => {
  const entries = new Map<CredentialId, SignedCredential>();
  return {
    save: async (credential) => {
      entries.set(credential.credential.id, credential);
    },
    findById: async (id) => entries.get(id),
    list: async () => [...entries.values()],
  };
};
