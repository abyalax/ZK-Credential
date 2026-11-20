# ZK-Credential

Privacy-preserving digital diploma verification using zk-SNARKs with issuer signature binding,
holder-key binding, and challenge-based replay protection.

## Requirements

- Node.js >= 22
- pnpm (version pinned in `packageManager`)

No native Circom install is needed: the compiler comes from the `circom2` npm package.

## Getting started

```bash
pnpm install
pnpm check        # typecheck + lint + fast tests (fakes)
pnpm test:zk      # builds the circuits, then runs circuit and real-proof tests
pnpm cli help
```

## Scripts

| Script                          | Purpose                                            |
| ------------------------------- | -------------------------------------------------- |
| `pnpm cli <command>`            | Run the CLI                                        |
| `pnpm test` / `pnpm test:watch` | Vitest (fast, fakes only)                          |
| `pnpm zk:setup`                 | Compile circuits, local trusted setup, export keys |
| `pnpm test:zk`                  | `zk:setup` + tests with real circuits and proofs   |
| `pnpm typecheck`                | `tsc --noEmit`                                     |
| `pnpm lint` / `pnpm format`     | Biome check / check with fixes                     |
| `pnpm build`                    | Compile `src/` to `dist/`                          |

## Layout

See [docs/architecture/overview.md](docs/architecture/overview.md). The protocol and encodings are in
[docs/protocol/protocol.md](docs/protocol/protocol.md), toolchain notes in
[docs/protocol/toolchain.md](docs/protocol/toolchain.md), and the plan in [TODO.md](TODO.md).
