import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Abi, Hex } from 'viem';
import { InfrastructureError } from '../../shared/index.js';
import { REPOSITORY_ROOT } from '../proof-system/artifact-paths.js';

/** Where `pnpm chain:build` writes Hardhat artifacts. */
export const CONTRACT_ARTIFACTS_DIR = join(REPOSITORY_ROOT, 'contracts', 'artifacts');

export interface ContractArtifact {
  readonly abi: Abi;
  readonly bytecode: Hex;
}

const findArtifactFile = async (dir: string, fileName: string): Promise<string | undefined> => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findArtifactFile(path, fileName);
      if (found) return found;
    } else if (entry.name === fileName) {
      return path;
    }
  }
};

/**
 * Reads the ABI and creation bytecode of a compiled contract by name. The lookup is by file name,
 * so it does not depend on how Hardhat lays out source names inside `contracts/artifacts/`.
 */
export const loadContractArtifact = async (
  name: string,
  artifactsDir: string = CONTRACT_ARTIFACTS_DIR,
): Promise<ContractArtifact> => {
  const path = existsSync(artifactsDir)
    ? await findArtifactFile(artifactsDir, `${name}.json`)
    : undefined;
  if (!path)
    throw new InfrastructureError(
      `Artifact for contract "${name}" not found in ${artifactsDir}. Run \`pnpm setup:zk\`, \`pnpm chain:sync\` and \`pnpm chain:build\` first.`,
    );
  const { abi, bytecode } = JSON.parse(await readFile(path, 'utf8')) as ContractArtifact;
  return { abi, bytecode };
};
