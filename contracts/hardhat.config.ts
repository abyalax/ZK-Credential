import { defineConfig } from 'hardhat/config';

/**
 * Local-only chain setup (P4.1). Everything runs offline: tests use the in-process `hardhat`
 * network, `pnpm chain:node` serves the same simulated network on http://127.0.0.1:8545.
 * Run Hardhat through the package scripts, which pass `--config contracts/hardhat.config.ts`.
 */
export default defineConfig({
  solidity: {
    version: '0.8.24',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  paths: {
    sources: './src',
    artifacts: './artifacts',
    cache: './cache',
  },
  networks: {
    hardhat: { type: 'edr-simulated', chainType: 'l1' },
    localhost: { type: 'http', chainType: 'l1', url: 'http://127.0.0.1:8545' },
  },
});
