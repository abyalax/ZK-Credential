import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { arch, cpus, homedir, platform, release, totalmem } from 'node:os';
import path, { join } from 'node:path';
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

const circomCandidates = (): string[] => {
  const exe = process.platform === 'win32' ? 'circom.exe' : 'circom';
  return [
    process.env.CIRCOM_PATH, // override eksplisit
    path.join(homedir(), '.cargo', 'bin', exe), // result of `cargo install`
    path.join(process.cwd(), 'node_modules', '.bin', exe),
  ].filter((p): p is string => Boolean(p));
};

const resolveCircom = (): string | null => circomCandidates().find((p) => path.isAbsolute(p) && existsSync(p)) ?? null;

const nativeCircomVersion = (): string => {
  const bin = resolveCircom();
  if (!bin) return 'not installed (circom2 WASM compiler used)';
  try {
    return execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim();
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
