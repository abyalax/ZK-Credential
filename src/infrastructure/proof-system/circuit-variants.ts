import type { CircuitSignals } from 'snarkjs';
import type { ProofGenerationInput } from '../../application/index.js';
import type { Issuer, PublicSignals } from '../../domain/index.js';
import {
  credentialCommitmentInputs,
  encodeChallenge,
  encodeVerifierId,
  parseFieldElement,
} from '../cryptography/credential-encoding.js';
import { parseIssuerPublicKey, parseIssuerSignature } from '../cryptography/eddsa-credential-signer.js';
import { issuerKeyHash } from '../cryptography/issuer-key-hash.js';

/**
 * One circuit of the ablation ladder (threshold -> +issuer -> +holder -> +replay). A variant knows
 * how to turn domain data into circuit inputs, and which public signals a proof must carry for
 * the claims it makes. Names match `circuits/src/variants/<name>.circom`.
 */
export interface CircuitVariant {
  readonly name: string;
  circuitInputs: (input: ProofGenerationInput, issuer?: Issuer) => CircuitSignals;
  /**
   * The circuit's public signals, in circuit order, as implied by the claims of a proof. The
   * engine rejects a proof whose payload carries different signals than its claims, so a claim
   * can never be altered without invalidating the proof.
   */
  expectedPublicSignals: (claims: PublicSignals) => readonly string[] | Promise<readonly string[]>;
}

/**
 * GPA threshold only. Public signals: [gpaThreshold].
 *
 * The issuer key, challenge and verifier id are NOT constrained by this circuit, so they can be
 * swapped without breaking the proof. That is the gap the later variants close.
 */
export const thresholdVariant: CircuitVariant = {
  name: 'threshold',
  circuitInputs: ({ signedCredential, request }) => ({
    gpa: signedCredential.credential.gpa.toString(),
    gpaThreshold: request.gpaThreshold.toString(),
  }),
  expectedPublicSignals: (claims) => [claims.gpaThreshold.toString()],
};

const issuerCircuitInputs = ({ signedCredential, request }: ProofGenerationInput, issuer?: Issuer): CircuitSignals => {
  const credential = signedCredential.credential;
  const fields = credentialCommitmentInputs(credential);
  if (!issuer) throw new TypeError('Issuer circuit inputs require the registered issuer');
  const [Ax, Ay] = parseIssuerPublicKey(issuer.publicKey);
  const { R8x, R8y, S } = parseIssuerSignature(signedCredential.signature);
  return {
    id: fields[0].toString(),
    issuerId: fields[1].toString(),
    holderPublicKey: fields[2].toString(),
    studentNumber: fields[3].toString(),
    fullName: fields[4].toString(),
    degree: fields[5].toString(),
    graduationDate: fields[6].toString(),
    gpa: credential.gpa.toString(),
    issuedAt: credential.issuedAt.toString(),
    Ax: Ax.toString(),
    Ay: Ay.toString(),
    R8x: R8x.toString(),
    R8y: R8y.toString(),
    S: S.toString(),
    gpaThreshold: request.gpaThreshold.toString(),
  };
};

const issuerExpectedPublicSignals: CircuitVariant['expectedPublicSignals'] = async (claims) => {
  return [(await issuerKeyHash(claims.issuerPublicKey)).toString(), claims.gpaThreshold.toString()];
};

/** Issuer authenticity plus the GPA policy. Circom orders outputs before public inputs. */
export const issuerVariant: CircuitVariant = {
  name: 'issuer',
  circuitInputs: issuerCircuitInputs,
  expectedPublicSignals: issuerExpectedPublicSignals,
};

/**
 * Issuer authenticity plus holder-key binding. The extra private input is the holder private key;
 * the public signals are the same as the issuer variant, because the binding is only proven.
 */
export const holderVariant: CircuitVariant = {
  name: 'holder',
  circuitInputs: (input, issuer) => ({
    ...issuerCircuitInputs(input, issuer),
    holderPrivateKey: parseFieldElement(input.holderPrivateKey, 'Holder private key').toString(),
  }),
  expectedPublicSignals: issuerExpectedPublicSignals,
};

/**
 * Issuer + holder + replay binding (the proposed model). Public signals:
 * [issuerKeyHash, gpaThreshold, challenge, verifierId].
 *
 * Unlike the earlier variants, the challenge and verifier id are constrained in the circuit, so
 * relabelling either one in the claims, or in the payload, invalidates the proof.
 */
export const fullVariant: CircuitVariant = {
  name: 'full',
  circuitInputs: (input, issuer) => ({
    ...holderVariant.circuitInputs(input, issuer),
    challenge: encodeChallenge(input.request.challenge).toString(),
    verifierId: encodeVerifierId(input.request.verifierId).toString(),
  }),
  expectedPublicSignals: async (claims) => {
    const [issuerKeyHash, gpaThreshold] = await issuerExpectedPublicSignals(claims);
    return [
      issuerKeyHash ?? '',
      gpaThreshold ?? '',
      encodeChallenge(claims.challenge).toString(),
      encodeVerifierId(claims.verifierId).toString(),
    ];
  },
};
