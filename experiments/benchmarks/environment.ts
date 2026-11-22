import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { REPOSITORY_ROOT } from '../../src/infrastructure/index.js';

const TOOLS = ['snarkjs', 'circomlibjs', 'circomlib', 'circom2', 'hardhat', 'viem', 'tsx'] as const;

const packageVersion = (name: string): string => {
  try {
    const manifest = JSON.parse(readFileSync(join(REPOSITORY_ROOT, 'node_modules', name, 'package.json'), 'utf8')) as {
      version: string;
    };
    return manifest.version;
  } catch {
    return 'unknown';
  }
};

const nativeCircomVersion = (): string => {
  try {
    return execFileSync('circom', ['--version'], { encoding: 'utf8' }).trim();
  } catch {
    return 'not installed (circom2 WASM compiler used)';
  }
};

/** Hardware and tool versions that every reported number depends on (P6.2). */
export const describeEnvironment = () => ({
  node: process.version,
  os: `${platform()} ${release()} (${arch()})`,
  cpuModel: cpus()[0]?.model ?? 'unknown',
  cpuCores: cpus().length,
  totalMemoryGb: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
  nativeCircom: nativeCircomVersion(),
  packages: Object.fromEntries(TOOLS.map((name) => [name, packageVersion(name)])),
});

export type Environment = ReturnType<typeof describeEnvironment>;
