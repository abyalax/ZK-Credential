# Protocol specification

Status: final for the thesis (P0-P7 implemented). All four circuit variants (`threshold`, `issuer`,
`holder`, `full`), the EdDSA-Poseidon issuance signer, the on-chain verifier and issuer registry, and
the hybrid challenge flow are implemented. Revocation is out of scope.

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

| Domain value                                                                                    | Field element                                                                                                                                    |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Gpa` (integer 0-400, GPA x 100)                                                                | the integer itself                                                                                                                               |
| `issuedAt` (epoch ms, integer < 2^53)                                                           | the integer itself                                                                                                                               |
| Text attribute (id, issuer id, student number, full name, degree, graduation date, verifier id) | `F_str(s) = int_be(first 31 bytes of SHA-256("zk-credential:v1:" ‖ utf8(s)))`. 248 bits, so always `< r` and no modular bias.                    |
| Issuer public key `(Ax, Ay)` on BabyJubJub                                                      | Domain `IssuerPublicKey` string is `"<Ax>:<Ay>"` in decimal. The circuit exposes `issuerKeyHash = Poseidon(Ax, Ay)` as one public signal.        |
| Holder public key                                                                               | `holderPublicKey = Poseidon(holderPrivateKey)`; the domain `HolderPublicKey` string is its canonical decimal form (see "Holder key derivation"). |
| `challenge`                                                                                     | 31 random bytes (62 hex characters), read big-endian.                                                                                            |

**Challenge size.** `Randomness.hex(32)` yields 256 bits, which can exceed `r` (about 254 bits).
`makeIssueChallenge` draws 31 random bytes, so it fits without reduction and without bias. Reducing 32
bytes mod `r` was rejected because two different challenges could then collide. P3.1 binds this
encoding into the circuit's public signals.

## Credential commitment and issuer signature (P1)

```
C = Poseidon(id, issuerId, holderPublicKey, studentNumber, fullName, degree, graduationDate, gpa, issuedAt)
signature = EdDSA-Poseidon.sign(issuerSecretKey, C)        -> (R8, S)
```

Nine inputs fit circomlib's Poseidon (up to 16). Text uses the `F_str` encoding above. The issuer
signs `C`, so any attribute change invalidates the signature. The issuer key is serialized as decimal
`Ax:Ay`, and signatures as JSON decimal fields `R8x`, `R8y`, `S`. `createEddsaCredentialSigner`
implements this representation and exposes the derived public key; issuance rejects a configured
signer whose key differs from the selected issuer registry entry. The private key is 32-byte hex and
must be provisioned outside source control.

## Circuit variants

The variants form the ablation ladder of the evaluation. Each adds mechanisms to the previous one.
Public signal order is the declaration order in the template (outputs first; none are used).

| Variant     | Private inputs                      | Public signals                                                | Proves                                                               | Status      |
| ----------- | ----------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------- | ----------- |
| `threshold` | `gpa`                               | `gpaThreshold`                                                | `0 <= gpa <= 400`, `gpaThreshold <= 400`, `gpa >= gpaThreshold`      | implemented |
| `issuer`    | + attributes, `(Ax, Ay)`, `(R8, S)` | `issuerKeyHash, gpaThreshold` (outputs precede public inputs) | + the attributes carry a valid signature of the issuer with that key | implemented |
| `holder`    | + `holderPrivateKey`                | same                                                          | + `Poseidon(holderPrivateKey) == holderPublicKey` inside `C`         | implemented |
| `full`      | same                                | `issuerKeyHash, gpaThreshold, challenge, verifierId`          | + the proof is bound to this challenge and verifier                  | implemented |

### `threshold` (implemented)

- 62 constraints (48 non-linear, 14 linear), 1 public input, 1 private input.
- Range checks come first. circomlib's `GreaterEqThan(n)` is only sound for inputs below `2^n`: with
  `n = 9`, `gpa = 600` against `gpaThreshold = 300` is accepted without them. `Num2Bits(9)` plus
  `LessEqThan` against 400 close that, and `circuits/tests/gpa-threshold.test.ts` fails if they are removed.
- The circuit bound `400` must match `GPA_MAX` in `src/domain/credential/gpa.ts`; a test enforces it.
- **Known gap by design:** nothing ties the proof to an issuer, a holder, a challenge or a verifier.
  `tests/zk/proof-engine.test.ts` simulationnstrates it ("known gap" tests) and the `issuer`, `holder` and
  `full` variants exist to close it.

### `issuer` (implemented, P1 ablation)

- 9,896 constraints (8,090 non-linear, 1,806 linear), 2 public signals (one public input and one
  output), and 14 private inputs. The output is `issuerKeyHash = Poseidon(Ax, Ay)`; the public input
  is `gpaThreshold`.
- On WSL Kali Linux with Node 22.23.5, a valid issuer proof took 1.04 s in the P1 real-proof test.
  This is a single local observation, not a performance benchmark. Setup uses a local single
  contributor ceremony for research only.
- On Windows with Node 22.22.0, the equivalent test took 1.87 s, including signing, proof generation
  and verification. Both timings are local single-run observations; repeatable benchmarks belong to
  P6.
- Real-proof tests accept a valid EdDSA-Poseidon signature and reject changed attributes, a signature
  from another issuer key, and malformed signature data (`tests/zk/issuer-proof.test.ts`).

### `holder` (implemented, P2 ablation)

- `HolderCredential` wraps `IssuerCredential` and adds one private input, `holderPrivateKey`, plus the
  constraint `Poseidon(holderPrivateKey) === holderPublicKey`. The same `holderPublicKey` signal feeds
  the issuer-signed commitment, so the key the prover knows is the key the issuer signed.
- Public signals are unchanged from `issuer` (`issuerKeyHash, gpaThreshold`): the binding is proven,
  never revealed. `holderPublicKey` and `holderPrivateKey` stay private, so two presentations of one credential
  share no holder identifier.
- 10,311 constraints (8,306 non-linear, 2,005 linear), 2 public signals (one public input and one
  output), and 15 private inputs. Against `issuer` (9,896) this adds 415 constraints (+4.2%): 216
  non-linear and 199 linear.
- On Windows with Node 22, a valid holder proof took 1.41 s including proving and verification
  (`[ablation:holder]` line of `tests/zk/holder-proof.test.ts`), against 1.43 s for the equivalent
  `issuer` test. The difference is within noise of a single local run, so no time overhead is
  claimed; repeatable benchmarks belong to P6.
- Real-proof tests (`tests/zk/holder-proof.test.ts`) accept the owner and reject: a copy of the
  credential without the secret, guessed secrets (including `holderPublicKey` used as the secret), a credential
  issued to another holder, and a credential whose `holderPublicKey` was swapped after signing. A last test
  shows the `issuer` circuit still accepts a copy without the secret, which is the gap this variant closes.

### `full` (implemented, P3 ablation, proposed model)

- `FullCredential(9, 400)` adds `challenge` and `verifierId` as public inputs. Public signal order is
  `[issuerKeyHash, gpaThreshold, challenge, verifierId]` (outputs first), and the on-chain
  `CredentialVerifier` uses the same order (`tests/chain/credential-verifier.test.ts`).
- 10,313 constraints, 2 more than `holder` (10,311), measured in P6 (configuration B4).
- Both new signals are constrained inside the circuit, so changing `challenge` or `verifierId` in the
  public signals fails cryptographic verification, not only the domain precondition. Variants without
  this binding accept a relabelled payload (scenarios `replay-relabelled-challenge`,
  `relay-to-other-verifier`).
- `estimateGas` of `CredentialVerifier.verifyCredential` is 251,374 gas on in-process Hardhat (P6).
  The challenge check is off-chain and costs no gas.

## On-chain verification

`CredentialVerifier` looks up `issuerKeyHash` in `IssuerRegistry` (owner-only registration, no
revocation), then runs the generated Groth16 verifier. An unregistered issuer reverts, and the domain
flow reports it as `PROOF_INVALID`. Registry keys are `issuerKeyHash = Poseidon(Ax, Ay)`, matching the
circuit's public output. The challenge store stays off-chain (hybrid design).

## Holder key derivation

`holderPublicKey = Poseidon(holderPrivateKey)`, with `holderPrivateKey` drawn as 31 uniformly random bytes (248 bits, always
below `r`, no modular bias) and serialised as a canonical decimal string. Reasons:

- **Cost.** One Poseidon hash of one input is far cheaper in constraints than the BabyJubJub scalar
  multiplication a signature-style key pair (`pk = sk * G`) would need inside the circuit.
- **Sufficient for the goal.** The holder never signs anything; it only has to prove knowledge of the
  preimage of the key the issuer committed to. A hash preimage proof does exactly that.
- **Reuse.** The commitment already hashes with Poseidon, so no new primitive enters the trusted base.

Consequences and limits:

- Security rests on Poseidon preimage resistance and on `holderPrivateKey` having full entropy. Short or
  guessable secrets (for example `123`) are insecure; always use `generateHolderKeyPair`.
- `holderPublicKey` is a hash, not a public-key signature key, so it cannot sign a challenge. Freshness
  comes from the challenge public input added in P3, not from the holder key.
- The secret is only ever passed to the circuit. `HolderKeyPair.privateKey` is non-enumerable, so
  `JSON.stringify`, spreading and `console.log` of a pair leave it out, and validation errors never
  repeat the value. Tests cover both (`tests/unit/infrastructure/holder-keys.test.ts`,
  `tests/zk/holder-proof.test.ts`).

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
- Challenge state stays off-chain (`ChallengeStore`); the issuer registry and the Groth16 verification are on-chain (P4, keyed by `issuerKeyHash`). The
  in-memory challenge store loses state on restart, which is a stated limitation for the thesis.

## Trust and security notes

- The local ceremony in `pnpm setup:zk` has one contributor and is for research only. Groth16 needs a
  trusted setup; a real deployment needs a multi-party ceremony.
- All data in this repository is synthetic.
