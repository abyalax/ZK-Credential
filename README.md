# ZK-Credential

Privacy-preserving digital diploma verification using zk-SNARKs with issuer signature binding,
holder-key binding, and challenge-based replay protection.

## Requirements

- Node.js >= 22
- pnpm (version pinned in `packageManager`)

## Getting started

```bash
pnpm install
pnpm check        # typecheck + lint + tests
pnpm cli help
```

## Scripts

| Script                          | Purpose                        |
| ------------------------------- | ------------------------------ |
| `pnpm cli <command>`            | Run the CLI                    |
| `pnpm test` / `pnpm test:watch` | Vitest                         |
| `pnpm typecheck`                | `tsc --noEmit`                 |
| `pnpm lint` / `pnpm format`     | Biome check / check with fixes |
| `pnpm build`                    | Compile `src/` to `dist/`      |

## Layout

See [docs/architecture/overview.md](docs/architecture/overview.md).
