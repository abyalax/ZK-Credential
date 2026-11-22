import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Real-proof tests run via `pnpm test:zk` (and `pnpm test:security`), contract tests via `pnpm test:chain`, CLI e2e via `pnpm test:e2e`.
    exclude: [
      ...configDefaults.exclude,
      'tests/zk/**',
      'tests/chain/**',
      'tests/security/**',
      'tests/e2e/**',
    ],
  },
});
