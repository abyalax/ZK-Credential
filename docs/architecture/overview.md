# Architecture overview

Modular monolith, CLI-first. Functional core, imperative shell, lightweight DDD.

## Layers and dependency rule

```
interfaces  ->  infrastructure  ->  application  ->  domain  ->  shared
(cli, http)     (adapters)          -use cases,    (pure rules)   - Result,
                                    -ports                        - Brand,
                                                                  - errors, utils
```

Imports point inward only. `tests/unit/architecture/boundaries.test.ts` enforces this, and also
keeps `domain/` free of packages and Node built-ins.

| Layer             | Responsibility                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain/`         | Pure types and rules: credential validation, issuer binding, challenge evaluation, verification preconditions. No I/O, clock or randomness.                                                                                                 |
| `application/`    | Use cases (`make*` factories taking ports) and port interfaces. Orchestrates; contains no crypto.                                                                                                                                           |
| `infrastructure/` | Adapters for ports: persistence, clock, randomness, and `proof-system/` (snarkjs `ProofEngine`), `key-management/` and `cryptography/` (EdDSA-Poseidon signer, holder keys), and `chain/` (on-chain issuer registry and verifier via viem). |
| `interfaces/`     | Entry points: the CLI, the Express simulation server in `http/` (docs/ui/server.md), and `composition/` (config and container).                                                                                                                   |
| `circuits/`       | Circom sources, setup and artifacts. Kept apart from the TypeScript app.                                                                                                                                                                    |
| `experiments/`    | Benchmarks, attack scenarios and result collection.                                                                                                                                                                                         |

## Conventions

- Expected outcomes return `Result<T, E>`; exceptions are for infrastructure failures.
- Use cases are factories: `makeVerifyCredential(deps)(input)`.
- Time and randomness come from the `Clock` and `Randomness` ports, never from globals in the core.
- Domain identifiers are branded strings; GPA is an integer scaled by 100 to fit a circuit field element.
- Replay protection: challenges are verifier-scoped, single-use and time-limited. A challenge is
  consumed only after the proof verifies, so a forged proof cannot burn it.

## Avoid

- `await` inside a loop
- multiple params more than 4, consider to single object params
- function with more than 50 lines, split it by responsibility
- one file with more than 300 line of codes
- Async function with no `await` inside function
- Deep nested ternary operation

## Scope decisions

- Revocation is out of scope for the thesis, so there is no `revoke-credential` use case.
- Issuer signature and holder-key binding are enforced inside the circuit. The domain only checks
  that the proof's issuer public key belongs to a registered issuer.
- The composition root lives in `interfaces/composition/` (P4.5): `loadConfig(process.env)` plus
  `createContainer(config)` wire the EdDSA signer, the on-chain issuer registry, and a proof engine
  that proves with snarkjs and verifies through `CredentialVerifier`. Challenges and credentials stay
  in memory in tests and benchmarks; the CLI persists them as JSON under `.zk-state/` through file stores. `tests/support/harness.ts` is the test-side equivalent and accepts a real `ProofEngine`.
- Tests with real circuits live in `circuits/tests/` and `tests/zk/` and run via `pnpm test:zk`;
  contract tests live in `tests/chain/` and run via `pnpm test:chain`. `pnpm check` stays fast and
  needs neither a circuit build nor a Solidity compiler.
