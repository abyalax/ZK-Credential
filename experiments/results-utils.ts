/**
 * Utilities for organizing experiment results by timestamp and gas mode.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Generates a timestamp string in format: YYYY-MM-DD-HHMMSS
 * Example: 2024-01-15-143022
 */
export const generateTimestamp = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
};

/**
 * Resolves the results directory path for a given timestamp and gas mode.
 * Structure: experiments/results/{timestamp}/{gas|no-gas}/
 */
export const resolveResultsPath = (repositoryRoot: string, timestamp: string, mode: 'with-gas' | 'no-gas'): string => {
  const gasFolder = mode === 'no-gas' ? 'no-gas' : 'gas';
  return `${repositoryRoot}/experiments/results/${timestamp}/${gasFolder}`;
};

/**
 * Resolves the results directory path for scenarios.
 * Structure: experiments/results/{timestamp}/scenarios/
 */
export const resolveScenariosPath = (repositoryRoot: string, timestamp: string): string => {
  return `${repositoryRoot}/experiments/results/${timestamp}/scenarios`;
};

/**
 * Finds the latest timestamp folder in the results directory.
 * Returns undefined if no timestamp folders exist.
 */
export const findLatestTimestamp = async (repositoryRoot: string): Promise<string | undefined> => {
  const resultsDir = join(repositoryRoot, 'experiments', 'results');
  try {
    const entries = await readdir(resultsDir, { withFileTypes: true });
    const timestampFolders = entries
      .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}-\d{6}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse();
    return timestampFolders[0];
  } catch {
    return undefined;
  }
};
