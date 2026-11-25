import { join } from 'node:path';
import { REPOSITORY_ROOT } from '../../infrastructure/index.js';

/** Directory for credentials, challenges, holder keys and proofs (gitignored). Shared by the CLI and the HTTP server. */
export const DEFAULT_STATE_DIR = join(REPOSITORY_ROOT, '.zk-state');

export const resolveStateDir = (env: Readonly<Record<string, string | undefined>>): string =>
  env.ZK_STATE_DIR?.trim() || DEFAULT_STATE_DIR;
