import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  asChallengeValue,
  asCredentialId,
  asVerifierId,
  type Proof,
} from '../../../domain/index.js';
import { writeJsonFile } from '../../../infrastructure/index.js';
import { CliError, parseGpa, requireFlag } from '../args.js';
import { loadHolderKeys, printJson, statePath, withContainer } from '../context.js';
import type { Command } from './types.js';

const parseProof = (text: string): Proof => {
  const value: unknown = JSON.parse(text);
  const proof = value as Partial<Proof> | null;
  const signals = proof?.publicSignals;
  if (proof?.protocol !== 'groth16' || typeof proof.payload !== 'string' || !signals)
    throw new CliError(
      'Proof file is not a valid proof (expected protocol, payload, publicSignals)',
    );
  return proof as Proof;
};

export const issue: Command = {
  name: 'issue',
  description:
    'Issue a signed credential: --student-number --name --degree --graduation-date --gpa',
  run: (args, context, io) =>
    withContainer(context, async (container) => {
      const holderPublicKey =
        args.flags.get('holder-public-key') ?? (await loadHolderKeys(context)).publicKey;
      const result = await container.issueCredential({
        issuerId: container.issuer.id,
        holderPublicKey,
        studentNumber: requireFlag(args, 'student-number'),
        fullName: requireFlag(args, 'name'),
        degree: requireFlag(args, 'degree'),
        graduationDate: requireFlag(args, 'graduation-date'),
        gpa: parseGpa(requireFlag(args, 'gpa'), 'gpa'),
      });
      if (!result.ok) throw new CliError(`Issuing failed: ${result.error}`);
      const { credential } = result.value;
      printJson(io, { credentialId: credential.id, issuerId: credential.issuerId });
      return 0;
    }),
};

export const challenge: Command = {
  name: 'challenge',
  description: 'Verifier: issue a single-use challenge: --verifier-id [--ttl-ms]',
  run: (args, context, io) =>
    withContainer(context, async (container) => {
      const ttl = args.flags.get('ttl-ms');
      const issued = await container.issueChallenge({
        verifierId: asVerifierId(requireFlag(args, 'verifier-id')),
        ...(ttl ? { ttlMs: Number(ttl) } : {}),
      });
      printJson(io, issued);
      return 0;
    }),
};

export const prove: Command = {
  name: 'prove',
  description:
    'Holder: build a proof: --credential-id --challenge --verifier-id --threshold [--out]',
  run: (args, context, io) =>
    withContainer(context, async (container) => {
      const holder = await loadHolderKeys(context);
      const challengeValue = requireFlag(args, 'challenge');
      const result = await container.generateProof({
        credentialId: asCredentialId(requireFlag(args, 'credential-id')),
        holderPrivateKey: holder.privateKey,
        request: {
          verifierId: asVerifierId(requireFlag(args, 'verifier-id')),
          challenge: asChallengeValue(challengeValue),
          gpaThreshold: parseGpa(requireFlag(args, 'threshold'), 'threshold'),
        },
      });
      if (!result.ok) throw new CliError(`Proving failed: ${result.error}`);
      const out =
        args.flags.get('out') ?? statePath(context, join('proofs', `${challengeValue}.json`));
      await writeJsonFile(out, result.value);
      printJson(io, { proofFile: out, publicSignals: result.value.publicSignals });
      return 0;
    }),
};

export const verify: Command = {
  name: 'verify',
  description: 'Verifier: check a proof file: --proof --verifier-id --threshold',
  run: (args, context, io) =>
    withContainer(context, async (container) => {
      const proof = parseProof(await readFile(requireFlag(args, 'proof'), 'utf8'));
      const result = await container.verifyCredential({
        proof,
        policy: {
          verifierId: asVerifierId(requireFlag(args, 'verifier-id')),
          requiredGpaThreshold: parseGpa(requireFlag(args, 'threshold'), 'threshold'),
        },
      });
      if (!result.ok) {
        printJson(io, { accepted: false, reason: result.error });
        return 2;
      }
      printJson(io, { accepted: true, ...result.value });
      return 0;
    }),
};
