# Protocol specification

Status: P0 specification. The `threshold` circuit variant is implemented; issuer, holder and replay
binding are specified here and built in P1-P3 (see `TODO.md`). Anything marked **(planned)** is a
design decision, not yet code.

## Statement

A verifier asks: _"Does the holder own a credential issued by a trusted issuer, bound to the
holder's key, with GPA >= T, answering my fresh challenge?"_ The holder answers with a zk-SNARK that
reveals only `T`, the issuer, the challenge and the verifier, never the GPA or any other attribute.

## Primitives

| Item         | Choice                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| Proof system | Groth16 over BN254 (snarkjs curve name `bn128`), circuits in Circom 2                                   |
| Hash         | Poseidon (circomlib) inside circuits                                                                    |
| Issuer sig   | EdDSA-Poseidon over BabyJubJub (circomlib circuit, `circomlibjs` off-circuit)                           |
| Field        | BN254 scalar field, `r = 21888242871839275222246405745257275088548364400416034343698204186575808495617` |

Every value entering a circuit is a field element, so every domain value needs a canonical encoding.

## Encodings

| Domain value                                                                                    | Field element                                                                                                                                           |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Gpa` (integer 0-400, GPA x 100)                                                                | the integer itself                                                                                                                                      |
| `issuedAt` (epoch ms, integer < 2^53)                                                           | the integer itself                                                                                                                                      |
| Text attribute (id, issuer id, student number, full name, degree, graduation date, verifier id) | `F_str(s) = int_be(first 31 bytes of SHA-256("zk-credential:v1:" ‖ utf8(s)))`. 248 bits, so always `< r` and no modular bias. **(planned)**             |
| Issuer public key `(Ax, Ay)` on BabyJubJub                                                      | Domain `IssuerPublicKey` string is `"<Ax>:<Ay>"` in decimal. The circuit exposes `issuerKeyHash = Poseidon(Ax, Ay)` as one public signal. **(planned)** |
| Holder public key                                                                               | `holderPk = Poseidon(holderSk)`; the domain `HolderPublicKey` string is its decimal form. **(planned)**                                                 |
| `challenge`                                                                                     | 31 random bytes (62 hex characters), read big-endian. **(planned, see below)**                                                                          |

**Challenge size.** `Randomness.hex(32)` yields 256 bits, which can exceed `r` (about 254 bits). The
challenge becomes 31 random bytes in P3.1 so it fits without reduction and without bias. Reducing 32
bytes mod `r` was rejected because two different challenges could then collide.

## Credential commitment and issuer signature (P1, planned)

```
C = Poseidon(id, issuerId, holderPk, studentNumber, fullName, degree, graduationDate, gpa, issuedAt)
signature = EdDSA-Poseidon.sign(issuerSecretKey, C)        -> (R8, S)
```

Nine inputs fit circomlib's Poseidon (up to 16). The issuer signs `C`, so any attribute change
invalidates the signature, and `holderPk` inside `C` ties the credential to one holder.

## Circuit variants

The variants form the ablation ladder of the evaluation. Each adds mechanisms to the previous one.
Public signal order is the declaration order in the template (outputs first; none are used).

| Variant     | Private inputs                      | Public signals                                                                  | Proves                                                               | Status      |
| ----------- | ----------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------- |
| `threshold` | `gpa`                               | `gpaThreshold`                                                                  | `0 <= gpa <= 400`, `gpaThreshold <= 400`, `gpa >= gpaThreshold`      | implemented |
| `issuer`    | + attributes, `(Ax, Ay)`, `(R8, S)` | + `issuerKeyHash`                                                               | + the attributes carry a valid signature of the issuer with that key | P1          |
| `holder`    | + `holderSk`                        | same                                                                            | + `Poseidon(holderSk) == holderPk` inside `C`                        | P2          |
| `full`      | same                                | `issuerKeyHash, gpaThreshold, challenge, verifierId` (order fixed when written) | + the proof is bound to this challenge and verifier                  | P3          |

### `threshold` (implemented)

- 62 constraints (48 non-linear, 14 linear), 1 public input, 1 private input.
- Range checks come first. circomlib's `GreaterEqThan(n)` is only sound for inputs below `2^n`: with
  `n = 9`, `gpa = 600` against `gpaThreshold = 300` is accepted without them. `Num2Bits(9)` plus
  `LessEqThan` against 400 close that, and `circuits/tests/gpa-threshold.test.ts` fails if they are removed.
- The circuit bound `400` must match `GPA_MAX` in `src/domain/credential/gpa.ts`; a test enforces it.
- **Known gap by design:** nothing ties the proof to an issuer, a holder, a challenge or a verifier.
  `tests/zk/proof-engine.test.ts` demonstrates it ("known gap" tests) and the `issuer`, `holder` and
  `full` variants exist to close it.

## What the verifier checks

`ProofEngine.verify` rejects unless **both** hold:

1. The payload's public signals equal the signals implied by the claims (`PublicSignals`) that the
   domain checks. This stops a holder from proving threshold 100 and claiming 300.
2. The Groth16 proof verifies against the variant's verification key.

The domain then checks the claims: issuer registered, verifier and challenge fresh and unexpired,
threshold at least the policy requirement. A challenge is consumed only after verification succeeds.

## Replay protection notes

- Groth16 proofs are **malleable**: anyone can re-randomise a valid proof into a different valid one for
  the same statement. Replay protection therefore cannot rely on proof bytes being unique. It rests on
  binding a verifier-issued, single-use challenge into the public signals (`full` variant).
- Challenge state stays off-chain (`ChallengeStore`); the issuer registry moves on-chain (P4). The
  in-memory challenge store loses state on restart, which is a stated limitation for the thesis.

## Trust and security notes

- The local ceremony in `pnpm zk:setup` has one contributor and is for research only. Groth16 needs a
  trusted setup; a real deployment needs a multi-party ceremony.
- All data in this repository is synthetic.
