import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Real-proof tests are slow and need built circuits; they run via `pnpm test:zk`.
    exclude: [...configDefaults.exclude, 'tests/zk/**'],
  },
});
