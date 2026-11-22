/**
 * Copies the snarkjs-generated Solidity verifier of the `full` circuit variant into the Hardhat
 * sources as `contracts/src/generated/Groth16Verifier.sol` (gitignored, never edited by hand).
 * Run `pnpm setup:zk` first. Usage: pnpm chain:sync
 */
import { existsSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { circuitArtifactPaths, REPOSITORY_ROOT } from '../src/infrastructure/proof-system/artifact-paths.js';

const VARIANT = 'full';
const target = join(REPOSITORY_ROOT, 'contracts', 'src', 'generated', 'Groth16Verifier.sol');

const main = async (): Promise<void> => {
  const { solidityVerifier } = circuitArtifactPaths(VARIANT);
  if (!existsSync(solidityVerifier)) throw new Error(`${solidityVerifier} is missing. Run \`pnpm setup:zk\` first.`);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(solidityVerifier, target);
  process.stdout.write(`Synced ${VARIANT} verifier -> ${target}\n`);
};

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
