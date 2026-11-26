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

## Quickstart: one end-to-end simulation

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


## SonarQube Scanner

The project includes a local SonarQube scanner script that runs analysis in an ephemeral Docker container without requiring a SonarCloud account.

### Prerequisites

- **Docker**: Required for running the SonarQube server. The script uses WSL Docker on Windows.
- **WSL2**: Required for Docker integration on Windows.
- **sonar-scanner CLI**: Must be installed and available in PATH.
  - Install via npm: `npm install -g sonar-scanner`
- **Kernel configuration**: The script automatically configures required WSL kernel settings (`vm.max_map_count`, `fs.file-max`).

### Usage

```Shell
# Full project analysis
.\scripts\sonar-scan.ps1

# Display scanner logs in real time
.\scripts\sonar-scan.ps1 -ShowLog

# Display detailed scanner debug logs
.\scripts\sonar-scan.ps1 -ShowLog -VerboseScanner

# Analyze changed files (compared to HEAD)
.\scripts\sonar-scan.ps1 -Mode Changed

# Analyze changed files (compared to a specific branch)
.\scripts\sonar-scan.ps1 -Mode Changed -BaseRef main

# Analyze staged files
.\scripts\sonar-scan.ps1 -Mode Staged

# Analyze a specific folder
.\scripts\sonar-scan.ps1 -Mode Folder -Path ".\src"

# Analyze with custom file extensions
.\scripts\sonar-scan.ps1 -Extensions @("ts", "tsx", "js")
```

### Analysis Modes

| Mode      | Description                                              | Use Case                               |
| --------- | -------------------------------------------------------- | -------------------------------------- |
| `Full`    | Analyzes all source files in the project                 | Complete codebase review, CI pipelines |
| `Changed` | Analyzes files changed since a reference (default: HEAD) | Pre-commit checks, PR reviews          |
| `Staged`  | Analyzes files currently staged in git                   | Pre-push checks                        |
| `Folder`  | Analyzes a specific directory                            | Targeted analysis of specific modules  |

### Parameters

| Parameter                | Type     | Default               | Description                                                             |
| ------------------------ | -------- | --------------------- | ----------------------------------------------------------------------- |
| `-Mode`                  | String   | `Full`                | Analysis mode: `Full`, `Changed`, `Staged`, or `Folder`                 |
| `-ShowLog`               | Switch   | `false`               | Display scanner output in real time                                     |
| `-VerboseScanner`        | Switch   | `false`               | Enable scanner debug output (`-X` flag)                                 |
| `-Path`                  | String   | `.`                   | Target folder (required for `Folder` mode)                              |
| `-BaseRef`               | String   | `HEAD`                | Git reference for comparison in `Changed` mode                          |
| `-ProjectKey`            | String   | `ZK-Credential`       | SonarQube project key (can override with `SONAR_PROJECT_KEY` in `.env`) |
| `-Extensions`            | String[] | `@("ts", "tsx")`      | File extensions to analyze                                              |
| `-SonarUrl`              | String   | `""`                  | Use existing SonarQube server URL (skips Docker, e.g., `http://localhost:9000`) |
| `-SonarImage`            | String   | `sonarqube:lts-community` | Docker image for SonarQube server (ignored if `-SonarUrl` is set) |
| `-StartupTimeoutSeconds` | Int      | `600`                 | Maximum wait time for SonarQube startup                                 |
| `-TaskTimeoutSeconds`    | Int      | `300`                 | Maximum wait time for compute engine processing                         |

### How It Works

If `-SonarUrl` is provided:
1. **Environment Setup**: Loads configuration from `.env` (optional `SONAR_PROJECT_KEY`)
2. **Scanner Execution**: Runs `sonar-scanner` against the provided SonarQube server
3. **Result Processing**: Displays dashboard URL

If `-SonarUrl` is not provided (default Docker mode):
1. **Environment Setup**: Loads configuration from `.env` (optional `SONAR_PROJECT_KEY`)
2. **Docker Check**: Validates WSL Docker availability
3. **Kernel Configuration**: Automatically sets required WSL kernel parameters for Elasticsearch
4. **Server Startup**: Launches an ephemeral SonarQube container on a random port
5. **Authentication**: Sets up temporary admin credentials and generates a user token
6. **Scanner Execution**: Runs `sonar-scanner` with auto-generated configuration
7. **Result Processing**: Waits for server-side analysis and displays dashboard URL
8. **Cleanup**: Revokes tokens, stops container, and restores environment

### Output

The script runs the analysis and displays a SonarQube dashboard URL where you can view results in your browser:
- Code quality metrics
- Code smells, bugs, vulnerabilities
- Security hotspots
- Duplications
- Code coverage (if configured)

Exit codes:
- `0`: Analysis completed successfully
- `1`: Analysis failed or error occurred

After analysis completes, open the provided dashboard URL to view detailed results and code quality reports.

### Configuration Files

- **`sonar-project.properties`**: SonarCloud configuration for remote analysis (optional)
  - Used when analyzing directly on SonarCloud.io
  - Requires `SONAR_TOKEN` and `SONAR_ORGANIZATION` in `.env`
- **`.env.example`**: Template for environment variables including SonarCloud credentials

### Troubleshooting

**SonarQube startup timeout**
- Increase `-StartupTimeoutSeconds` if your system is slow
- Check Docker is running with `wsl docker info`

**Kernel configuration errors**
- Ensure WSL2 is properly configured
- The script automatically applies required settings; manual intervention is rarely needed

**No issues found but code has problems**
- Verify file extensions match your project with `-Extensions`
- Check exclusions in the script (node_modules, dist, build, etc.)

**Container cleanup fails**
- Manually remove containers: `wsl docker ps -a` and `wsl docker rm <container>`
- The script uses unique container names each run

### CI Integration

For CI pipelines:
```yaml
- name: Run SonarQube Analysis
  run: ./scripts/sonar-scan.ps1 -Mode Changed -BaseRef origin/main
```

### SonarCloud (Optional)

For remote analysis on SonarCloud.io instead of local Docker:
1. Create a SonarCloud account and project
2. Add credentials to `.env`:
   ```
   SONAR_TOKEN=your_token_here
   SONAR_ORGANIZATION=your_org
   ```
3. Run: `sonar-scanner` (reads from `sonar-project.properties`)