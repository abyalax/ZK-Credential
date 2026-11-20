## Prerequisites

### 1. Install Dependencies

Install all project dependencies using PNPM.

```bash
pnpm install
```

### 2. Setup ZK Credentials

Build the zk-SNARK circuits, including compilation, Powers of Tau, Groth16 setup, and verifier generation.

```bash
pnpm zk:setup
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
pnpm zk:setup
```

Run the ZK setup process followed by ZK-specific tests.

```bash
pnpm test:zk
```
