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
pnpm check              # typecheck + lint + fast tests (fakes)
pnpm test:zk            # builds the circuits, then runs circuit and real-proof tests
pnpm test:security      # runs security tests with real Groth16 proofs
pnpm experiment:p5      # runs P5 attack-scenario experiments (generates JSON/CSV results)
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

## Static Analysis (SonarQube Cloud)

Analisis kualitas kode dan keamanan memakai [SonarScanner CLI](https://docs.sonarsource.com/sonarqube-cloud/advanced-setup/ci-based-analysis/sonarscanner-cli/) yang mengirim hasil ke SonarQube Cloud (region EU).

### Prasyarat

1. SonarScanner CLI terpasang dan folder `bin`-nya ada di `PATH`. Cek dengan `sonar-scanner --version`.
2. Project sudah dibuat di SonarQube Cloud (_+ → Analyze new project_). Untuk mode sebagian, buat juga project `<project-key>-partial`.
3. Token dibuat di https://sonarcloud.io/account/security.
4. Salin `.env.example` menjadi `.env` lalu isi nilainya.

```env
SONAR_TOKEN=
SONAR_ORGANIZATION=
SONAR_PROJECT_KEY=
```

Skrip membaca `.env` secara otomatis. Variabel yang sudah ada di environment tidak ditimpa. File `.env` tidak boleh di-commit.

### Menjalankan

```powershell
.\scripts\sonar-scan.ps1                          # seluruh codebase
.\scripts\sonar-scan.ps1 -Mode Changed            # file berubah vs HEAD (termasuk untracked)
.\scripts\sonar-scan.ps1 -Mode Changed -BaseRef main
.\scripts\sonar-scan.ps1 -Mode Staged             # hanya file staged
.\scripts\sonar-scan.ps1 -Mode Folder -Path .\src\circuits
```

| Mode      | Cakupan                    | Project key                 |
| --------- | -------------------------- | --------------------------- |
| `Full`    | Seluruh `*.ts` dan `*.tsx` | `SONAR_PROJECT_KEY`         |
| `Changed` | File berubah vs `-BaseRef` | `SONAR_PROJECT_KEY-partial` |
| `Staged`  | File di staging area       | `SONAR_PROJECT_KEY-partial` |
| `Folder`  | Satu folder                | `SONAR_PROJECT_KEY-partial` |

Mode sebagian memakai project terpisah agar dashboard utama tidak menganggap file lain terhapus.

### Parameter

| Parameter       | Default                 | Keterangan                                 |
| --------------- | ----------------------- | ------------------------------------------ |
| `-Mode`         | `Full`                  | `Full`, `Changed`, `Staged`, atau `Folder` |
| `-Path`         | `.`                     | Folder target (mode `Folder`)              |
| `-BaseRef`      | `HEAD`                  | Pembanding git (mode `Changed`)            |
| `-ProjectKey`   | `SONAR_PROJECT_KEY`     | Project key di SonarQube Cloud             |
| `-Organization` | `SONAR_ORGANIZATION`    | Organization key                           |
| `-HostUrl`      | `https://sonarcloud.io` | URL server                                 |
| `-Extensions`   | `ts`, `tsx`             | Ekstensi yang dianalisis                   |

### Catatan

- Hasil lengkap (issue, quality gate, duplikasi) dilihat di dashboard https://sonarcloud.io.
- Folder `.scannerwork/` dihasilkan scanner dan sudah masuk `.gitignore`.
- Cek cepat satu file tanpa server: `sonar analyze --file <path>`.
