import { join } from 'node:path';
import type { HolderPrivateKey, HolderPublicKey } from '../../domain/index.js';
import { asHolderPrivateKey, asHolderPublicKey } from '../../domain/index.js';
import {
  createFileChallengeStore,
  createFileCredentialRepository,
  readJsonFile,
  writeJsonFile,
} from '../../infrastructure/index.js';
import type { Container } from '../composition/index.js';
import { createContainer, DEFAULT_STATE_DIR, loadConfig, resolveStateDir } from '../composition/index.js';
import { CliError } from './args.js';

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

/** Everything the commands need from the outside world; tests inject their own. */
export interface CliContext {
  /** Directory for credentials, challenges, holder keys and proofs (gitignored). */
  readonly stateDir: string;
  readonly openContainer: () => Promise<Container>;
  /** Runs the benchmark harness with the given arguments and returns its exit code. */
  readonly runBench: (args: readonly string[]) => Promise<number>;
}

export { DEFAULT_STATE_DIR };

export const statePath = (context: CliContext, name: string): string => join(context.stateDir, name);

export const createDefaultContext = (
  env: Readonly<Record<string, string | undefined>>,
  runBench: CliContext['runBench'],
): CliContext => {
  const stateDir = resolveStateDir(env);
  return {
    stateDir,
    runBench,
    openContainer: () =>
      createContainer(loadConfig(env), {
        credentials: createFileCredentialRepository(join(stateDir, 'credentials.json')),
        challenges: createFileChallengeStore(join(stateDir, 'challenges.json')),
      }),
  };
};

/** Opens the container for one command and always releases snarkjs' worker threads. */
export const withContainer = async <T>(context: CliContext, task: (container: Container) => Promise<T>): Promise<T> => {
  const container = await context.openContainer();
  try {
    return await task(container);
  } finally {
    await container.close();
  }
};

export interface HolderKeyFile {
  readonly publicKey: HolderPublicKey;
  readonly privateKey: HolderPrivateKey;
}

const HOLDER_KEY_FILE = 'holder.json';

export const saveHolderKeys = (context: CliContext, keys: HolderKeyFile): Promise<void> =>
  writeJsonFile(statePath(context, HOLDER_KEY_FILE), keys);

export const loadHolderKeys = async (context: CliContext): Promise<HolderKeyFile> => {
  const stored = await readJsonFile<{ publicKey?: string; privateKey?: string } | undefined>(
    statePath(context, HOLDER_KEY_FILE),
    undefined,
  );
  if (!(stored?.publicKey && stored.privateKey)) throw new CliError('No holder key found. Run `pnpm cli keygen` first.');
  return {
    publicKey: asHolderPublicKey(stored.publicKey),
    privateKey: asHolderPrivateKey(stored.privateKey),
  };
};

export const printJson = (io: CliIo, value: unknown): void => io.stdout(JSON.stringify(value, null, 2));
