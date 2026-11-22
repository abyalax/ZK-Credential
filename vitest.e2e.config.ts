import { defineConfig } from 'vitest/config';

/**
 * CLI end-to-end tests on the in-process Hardhat network with real proofs. They need built
 * circuits and compiled contracts: `pnpm test:e2e` runs `setup:zk`, `chain:sync` and `chain:build`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
