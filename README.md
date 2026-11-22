# ZK-Credential

Privacy-preserving digital diploma verification using zk-SNARKs with issuer signature binding,
holder-key binding, and challenge-based replay protection.

## Requirements

- Node.js >= 22.13.0
- pnpm (version pinned in `packageManager`)
- Tool versions are pinned exactly in `package.json` and `pnpm-lock.yaml`.

Circuits compile with the pnpm-installed `circom2` package. On Windows, setup uses a native
`circom` binary when available because the WASM compiler cannot emit the witness generator there.
The repository TypeScript and Hardhat configuration are checked with `pnpm check`.

## Getting started

```bash
pnpm install
pnpm check        # typecheck + lint + fast tests (fakes)
pnpm test:zk      # builds the circuits, then runs circuit and real-proof tests
pnpm test:security  # runs security tests with real Groth16 proofs
pnpm experiment:p5   # runs P5 attack-scenario experiments (generates JSON/CSV results)
pnpm cli help
```

## Quickstart: one end-to-end demo

Local research setup only: the Hardhat dev key and the trusted setup below are not for real use.

```bash
pnpm install
pnpm setup:zk full && pnpm chain:sync && pnpm chain:build

# terminal 1: local chain
pnpm chain:node

# terminal 2: generate issuer key, deploy, then copy the printed addresses into .env (see .env.example)
pnpm generate:issuer-key                          # generates and prints ISSUER_PRIVATE_KEY
pnpm chain:deploy

pnpm cli keygen                                   # holder key pair (private key stays in .zk-state/)
pnpm cli register-issuer                          # owner registers the issuer key on-chain
pnpm cli issue --student-number 2210001 --name "Test Student" --degree "S1 Teknik Komputer" --graduation-date 2026-08-01 --gpa 3.75
pnpm cli challenge --verifier-id verifier-a       # prints the challenge value
pnpm cli prove --credential-id <id> --challenge <value> --verifier-id verifier-a --threshold 3.50
pnpm cli verify --proof .zk-state/proofs/<value>.json --verifier-id verifier-a --threshold 3.50
```

`verify` prints `{"accepted": true, ...}` (exit 0). Running it again on the same proof prints
`CHALLENGE_ALREADY_USED` (exit 2). `pnpm cli bench --runs=30 --no-gas` runs the P6 benchmark.
Commands are documented in [docs/command/cli.md](docs/command/cli.md).

## Scripts

| Script                          | Purpose                                                          |
| ------------------------------- | ---------------------------------------------------------------- |
| `pnpm cli <command>`            | Run the CLI                                                      |
| `pnpm generate:issuer-key`      | Generate a new 32-byte hex ISSUER_PRIVATE_KEY                    |
| `pnpm test` / `pnpm test:watch` | Vitest (fast, fakes only)                                        |
| `pnpm setup:zk`                 | Compile circuits, local trusted setup, export keys               |
| `pnpm test:zk`                  | `setup:zk` + tests with real circuits and proofs                 |
| `pnpm test:security`            | `setup:zk` + security tests with real Groth16 proofs             |
| `pnpm experiment:p5`            | `setup:zk` + P5 attack-scenario experiments (generates JSON/CSV) |
| `pnpm chain:node`               | Local Hardhat node (offline)                                     |
| `pnpm chain:deploy`             | Deploy registry + verifier contracts to the node                 |
| `pnpm chain:test`               | Build circuit and contracts, run contract tests                  |
| `pnpm test:e2e`                 | Build everything, run the CLI e2e test on in-process Hardhat     |
| `pnpm typecheck`                | `tsc --noEmit`                                                   |
| `pnpm typecheck:contracts`      | Typecheck Hardhat config with isolated tsconfig                  |
| `pnpm lint` / `pnpm format`     | Biome check / check with fixes                                   |
| `pnpm build`                    | Compile `src/` to `dist/`                                        |

## Layout

See [docs/architecture/overview.md](docs/architecture/overview.md). The protocol and encodings are in
[docs/protocol/protocol.md](docs/protocol/protocol.md), toolchain notes in
[docs/protocol/toolchain.md](docs/protocol/toolchain.md), and the plan in [TODO.md](TODO.md).
