import { defineConfig } from 'vitest/config';

/** Tests that run real circuits and proofs. They need `pnpm zk:setup` first (`pnpm test:zk` does it). */
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'circuits/tests/**/*.test.ts',
      'tests/zk/**/*.test.ts',
      'tests/security/**/*.test.ts',
    ],
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
});
