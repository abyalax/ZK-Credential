import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPOSITORY_ROOT } from '../../infrastructure/index.js';
import { createDefaultContext } from './context.js';
import { runCli } from './run-cli.js';

// Node >= 22.13: load .env (contract addresses, issuer key) when present; real env vars win.
const envFile = join(REPOSITORY_ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const runBench = (args: readonly string[]): Promise<number> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', join(REPOSITORY_ROOT, 'experiments', 'benchmarks', 'run.ts'), ...args],
      { cwd: REPOSITORY_ROOT, stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });

process.exitCode = await runCli(
  process.argv.slice(2),
  {
    stdout: (text) => process.stdout.write(`${text}\n`),
    stderr: (text) => process.stderr.write(`${text}\n`),
  },
  createDefaultContext(process.env, runBench),
);
