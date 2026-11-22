# Threats to validity (P6)

## Internal validity

- **Local powers of tau.** `pnpm setup:zk` runs a single-contributor ceremony. Proving and
  verification costs are representative, but the keys are not trustworthy. Research use only.
- **Challenge store is in-memory.** Replay protection is evaluated against a process-local store.
  Its cost is excluded from the benchmarks (verification time is pure cryptographic
  verification) and it does not survive restarts or scale across verifier instances.
- **Synthetic data.** Credentials are generated, with one numeric attribute (GPA). Real
  credentials with more attributes change the commitment size and the witness work.
- **Gas covers B4 only.** Only the proposed model has an on-chain verifier
  (`CredentialVerifier`); A and B1-B3 report no gas. The challenge check is off-chain and costs
  no gas. Gas is an `estimateGas` on in-process Hardhat, not a mined transaction on a public chain.
- **Baseline A is a minimal comparator.** It checks the issuer's EdDSA-Poseidon signature and
  the GPA policy in the clear, with full disclosure. It is not a complete credential format.

## Measurement validity

- **Memory is process peak RSS.** Each configuration runs in its own process, so `peakRssMb` is
  the peak of the whole run (setup, proving key load, proving, verifying), not per phase.
  `rssBeforeSetupMb` is reported to allow a rough delta.
- **Timing noise.** Wall-clock times on a shared machine. Warm-up runs absorb JIT and WASM
  compilation, but OS scheduling and thermal throttling remain; report mean, median and std, and
  prefer the median when std is large.
- **Prove time includes witness generation** (`snarkjs.groth16.fullProve`), not setup.
- **Node only.** Browser and mobile performance are out of scope.

## External validity

- Results depend on the recorded hardware and tool versions (`environment` in
  `experiments/results/p6-benchmark.json`) and should not be generalised across machines.
- Groth16 on BN254 with circom/snarkjs only; other proof systems are not compared.

## CLI state (P7)

- The CLI keeps challenges and credentials in JSON files under `.zk-state/`. `markConsumed` is
  atomic inside one process only; two CLI processes verifying the same proof at the same instant
  could both pass. The in-memory store of the benchmarks and security tests does not have this gap.
- Credentials and the holder private key are stored unencrypted in the state directory.
