import { buildEddsa, buildPoseidon } from 'circomlibjs';
import * as snarkjs from 'snarkjs';
import type { Credential, SignedCredential } from '../../src/domain/index.js';
import { asChallengeValue } from '../../src/domain/index.js';
import { credentialCommitmentInputs } from '../../src/infrastructure/cryptography/credential-encoding.js';
import {
  parseIssuerPublicKey,
  parseIssuerSignature,
} from '../../src/infrastructure/cryptography/eddsa-credential-signer.js';
import { circuitArtifactPaths } from '../../src/infrastructure/proof-system/artifact-paths.js';
import type { PayloadContent } from '../../src/infrastructure/proof-system/proof-payload.js';
import { gpa, verifierA } from '../../tests/support/harness.js';
import { createParties, createScenarioContext, makeSignCredential } from '../scenarios/context.js';
import type { Configuration } from './index.js';

/** What the holder sends to the verifier, plus its serialized sizes. */
export interface Presentation {
  /** Size of the cryptographic proof (ZKP) or of the issuer signature (baseline). */
  readonly proofBytes: number;
  /** Size of everything that crosses the wire (proof + public signals, or credential + signature). */
  readonly payloadBytes: number;
  readonly data: unknown;
}

export interface Runner {
  /** R1CS constraints; `undefined` for the baseline, which has no circuit. */
  readonly constraints: number | undefined;
  readonly prove: () => Promise<Presentation>;
  readonly verify: (presentation: Presentation) => Promise<boolean>;
  readonly close: () => Promise<void>;
}

const REQUIRED_THRESHOLD = 300;
const byteLength = (value: string): number => Buffer.byteLength(value, 'utf8');

const createZkRunner = async (circuit: NonNullable<Configuration['circuit']>): Promise<Runner> => {
  const ctx = await createScenarioContext(circuit);
  const session = ctx.session();
  const challenge = (await session.issueChallenge({ verifierId: verifierA })).value.toString();
  const signedCredential = await ctx.signCredential();
  const info = await snarkjs.r1cs.info(circuitArtifactPaths(circuit).r1cs);

  return {
    constraints: info.nConstraints,
    async prove() {
      const proof = await ctx.engine.generate({
        signedCredential,
        holderPrivateKey: ctx.owner.privateKey,
        request: {
          verifierId: verifierA,
          challenge: asChallengeValue(challenge),
          gpaThreshold: gpa(REQUIRED_THRESHOLD),
        },
      });
      const content = JSON.parse(proof.payload) as PayloadContent;
      return {
        proofBytes: byteLength(JSON.stringify(content.proof)),
        payloadBytes: byteLength(proof.payload),
        data: proof,
      };
    },
    // Pure cryptographic verification: domain preconditions (challenge store, clock) are excluded.
    verify: async ({ data }) => ctx.engine.verify(data as Parameters<typeof ctx.engine.verify>[0]),
    close: ctx.close,
  };
};

/**
 * Configuration A: the holder discloses the whole credential and the verifier checks the issuer's
 * EdDSA-Poseidon signature over its commitment, then applies the GPA policy in the clear.
 */
const createBaselineRunner = async (): Promise<Runner> => {
  const [eddsa, poseidon, parties] = await Promise.all([
    buildEddsa(),
    buildPoseidon(),
    createParties(),
  ]);
  const signed: SignedCredential = await makeSignCredential(parties)();
  const trustedIssuerKey = parties.issuer.publicKey;

  return {
    constraints: undefined,
    async prove() {
      const payload = JSON.stringify({
        credential: signed.credential,
        signature: signed.signature,
      });
      return {
        proofBytes: byteLength(signed.signature),
        payloadBytes: byteLength(payload),
        data: payload,
      };
    },
    async verify({ data }) {
      const disclosed = JSON.parse(data as string) as { credential: Credential; signature: string };
      const { F } = eddsa;
      const { R8x, R8y, S } = parseIssuerSignature(disclosed.signature);
      const [Ax, Ay] = parseIssuerPublicKey(trustedIssuerKey);
      const commitment = poseidon(credentialCommitmentInputs(disclosed.credential));
      const signatureValid = eddsa.verifyPoseidon(commitment, { R8: [F.e(R8x), F.e(R8y)], S }, [
        F.e(Ax),
        F.e(Ay),
      ]);
      return signatureValid && disclosed.credential.gpa >= REQUIRED_THRESHOLD;
    },
    close: async () => {},
  };
};

export const createRunner = async (configuration: Configuration): Promise<Runner> =>
  configuration.circuit ? createZkRunner(configuration.circuit) : createBaselineRunner();
