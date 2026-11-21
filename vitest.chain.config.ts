import { defineConfig } from 'vitest/config';

/**
 * Contract tests on the in-process Hardhat network (P4.3). They need built circuits plus compiled
 * contracts: `pnpm test:chain` runs `zk:setup`, `chain:sync` and `chain:build` first.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/chain/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
