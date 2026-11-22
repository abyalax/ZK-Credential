## Prerequisites

### 1. Install Dependencies

Install all project dependencies using PNPM.

```bash
pnpm install
```

### 2. Setup ZK Credentials

Build the zk-SNARK circuits, including compilation, Powers of Tau, Groth16 setup, and verifier generation.

```bash
pnpm setup:zk
```

## Available Commands

### 1. CLI

Run the CLI interface.

```bash
pnpm cli
```

### 2. Type Checking

Run TypeScript type checking without emitting files.

```bash
pnpm typecheck
```

### 3. Build

Build the project using TypeScript.

```bash
pnpm build
```

### 4. Testing

Run tests using Vitest.

```bash
pnpm test
```

Run tests in watch mode.

```bash
pnpm test:watch
```

### 5. Code Quality

Check code using the Biome linter.

```bash
pnpm lint
```

Format source code using Biome.

```bash
pnpm format
```

Run type checking, linting, and tests together.

```bash
pnpm check
```

### 6. ZK-SNARK

Build zk-SNARK circuits, including compilation, Powers of Tau, Groth16 setup, and verifier generation.

```bash
pnpm setup:zk
```

Run the ZK setup process followed by ZK-specific tests.

```bash
pnpm test:zk
```

Run security tests with real Groth16 proofs against all circuit variants.

```bash
pnpm test:security
```

Run P5 attack-scenario experiments and generate structured results (JSON/CSV) in `experiments/results/`.

```bash
pnpm experiment:p5
```

### 7. Blockchain (Hardhat, Local)

Start a local Hardhat node (offline).

```bash
pnpm chain:node
```

Deploy registry and verifier contracts to the local node.

```bash
pnpm chain:deploy
```

Build circuit and contracts, then run contract tests.

```bash
pnpm chain:test
```

### 8. Protocol CLI (P7)

Configuration comes from `.env` (see `.env.example`; `ISSUER_PRIVATE_KEY` is required). State
(credentials, challenges, holder private key, proofs) lives in `.zk-state/` (override with
`ZK_STATE_DIR`). It is gitignored and stored unencrypted: local research use only.

| Command           | Role           | Flags                                                                            |
| ----------------- | -------------- | -------------------------------------------------------------------------------- |
| `keygen`          | holder         | none. Writes `holder.json`, prints only the public key                           |
| `register-issuer` | registry owner | none. Needs `REGISTRY_OWNER_PRIVATE_KEY`                                         |
| `issue`           | issuer         | `--student-number --name --degree --graduation-date --gpa [--holder-public-key]` |
| `challenge`       | verifier       | `--verifier-id [--ttl-ms]`                                                       |
| `prove`           | holder         | `--credential-id --challenge --verifier-id --threshold [--out]`                  |
| `verify`          | verifier       | `--proof --verifier-id --threshold`                                              |
| `bench`           | researcher     | passes flags to the P6 harness, e.g. `--runs=30 --no-gas B4`                     |

GPA flags are decimals (`3.75`), never the scaled integer. Exit codes: `0` success, `1` error,
`2` proof rejected by `verify`.

Run the CLI end-to-end test (real proofs, in-process Hardhat):

```bash
pnpm test:e2e
```
