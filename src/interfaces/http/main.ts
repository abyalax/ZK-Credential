import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  createFileChallengeStore,
  createFileCredentialRepository,
  createFileHolderKeyring,
  REPOSITORY_ROOT,
} from '../../infrastructure/index.js';
import { createContainer, loadConfig, resolveStateDir } from '../composition/index.js';
import { loadHttpConfig } from './config.js';
import { startHttpServer } from './server.js';

// Node >= 22.13: load .env (contract addresses, issuer key) when present; real env vars win.
const envFile = join(REPOSITORY_ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Same state files as the CLI, so `pnpm cli` and the UI act as the same holder and see the same credentials.
const stateDir = resolveStateDir(process.env);
const container = await createContainer(loadConfig(process.env), {
  credentials: createFileCredentialRepository(join(stateDir, 'credentials.json')),
  challenges: createFileChallengeStore(join(stateDir, 'challenges.json')),
  holderKeyring: createFileHolderKeyring(join(stateDir, 'holder.json')),
});

const server = await startHttpServer({ services: container }, loadHttpConfig(process.env));
console.log(`ZK-Credential API on ${server.url}`);
console.log(`API docs (Scalar): ${server.url}/api/docs`);

let stopping = false;
const shutdown = async (): Promise<void> => {
  if (stopping) return;
  stopping = true;
  await server.close();
  // Stops snarkjs' worker threads so the process can exit.
  await container.close();
};
const stop = (): void => {
  shutdown().catch((error: unknown) => {
    console.error('Shutdown failed', error);
    process.exitCode = 1;
  });
};
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, stop);
