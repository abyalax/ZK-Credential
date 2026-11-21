# Toolchain notes

Findings from the P0.1 spike and how the ZK build works.

## Versions (pinned in `package.json`)

| Tool          | Version | Role                                                     |
| ------------- | ------- | -------------------------------------------------------- |
| `circom2`     | 0.2.23  | Circom 2.2.3 compiler as WebAssembly                     |
| `circomlib`   | 2.0.5   | Circom templates (Poseidon, EdDSA, comparators)          |
| `snarkjs`     | 0.7.6   | Witness, Groth16 setup, prove, verify, Solidity verifier |
| `circomlibjs` | 0.1.7   | Poseidon and EdDSA in TypeScript                         |
| Hardhat       | 3.22.0  | Contract toolchain                                       |
| viem          | 2.58.1  | On-chain issuer registry adapter                         |

## Commands

| Command                       | Does                                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm zk:setup [--force] [v]` | Compile each variant, run the local ceremony, write keys and `verifier.sol`. Idempotent: skipped when the circuit sources are unchanged. |
| `pnpm test:zk`                | `zk:setup`, then circuit tests and real-proof tests (about 15 s)                                                                         |
| `pnpm check`                  | Typecheck app and Hardhat config, lint, and fast tests with fakes. Needs no circuit build.                                               |

Output goes to `circuits/artifacts/` (gitignored): `ptau/pot<N>_final.ptau` (shared) and
`<variant>/` with `.r1cs`, `<variant>_js/<variant>.wasm`, `.zkey`, `verification_key.json`,
`verifier.sol`, `source.sha256`.

## Findings

- **circom2 include paths.** It runs inside WASI and only sees paths relative to its working
  directory. Run it from the repository root with `-l node_modules`; an absolute `-l` or another
  working directory fails with "file to be included has not been found". `scripts/zk-setup.ts` does this.
- **`blake-hash` native build is skipped** (`pnpm-workspace.yaml`, `allowBuilds`). It is an optional
  addon of `circomlibjs`; the pure JS fallback works, and EdDSA-Poseidon signing was exercised under it.
- **Typings.** `@types/snarkjs` covers what we use. `circomlibjs` ships none, so
  `src/infrastructure/types/circomlibjs.d.ts` declares the small surface we need.
- **snarkjs worker threads** keep the process alive after the first curve use. Call
  `terminateSnarkjs()` (the engine's `close()`) when done; the setup script and tests do.
- **Importing snarkjs is lazy** (`loadSnarkjs`), so code that never proves or verifies stays fast.
- **Hardhat 3.22 with TypeScript 7.0:** installs, runs, and `hardhat.config.ts` typechecks under the
  repo's strict settings. Compiling a contract could not be verified in the sandbox used for P0
  because Hardhat downloads `solc` from a host that was blocked there; confirm on a normal machine
  at the start of P4.1.
- **WASM compilation on Windows.** `circom2` can emit R1CS but fails to emit the WASM witness
  generator. `zk:setup` prefers native `circom` when available and exits with an actionable message
  when no compiler can generate the WASM. Other platforms use the pnpm-installed `circom2` package.
- **Hardhat 3.22.0 + TypeScript 7.0.2.** The Hardhat config under `contracts/` typechecks under an
  isolated tsconfig, and Hardhat loads it from that directory. Solidity compilation remains part of
  P4.1, where the local compiler setup will be validated.

The P1 on-chain registry lives in `contracts/src/IssuerRegistry.sol`. It records canonical `Ax:Ay`
keys by keccak256, permits only the deployer to add keys, and emits `IssuerAdded`. The viem adapter
checks configured domain issuer metadata against `isTrusted` on every registry read, feeding the
existing verification precondition path. The contract has no revocation operation.
