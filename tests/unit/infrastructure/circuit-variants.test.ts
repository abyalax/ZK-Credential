import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProofGenerationInput } from '../../../src/application/index.js';
import {
  asChallengeValue,
  asHolderPrivateKey,
  asIssuerPublicKey,
  asVerifierId,
  createCredential,
  type PublicSignals,
} from '../../../src/domain/index.js';
import {
  circuitArtifactPaths,
  createSnarkjsProofEngine,
  createStaticIssuerRegistry,
  thresholdVariant,
} from '../../../src/infrastructure/index.js';
import { InfrastructureError } from '../../../src/shared/index.js';
import { testHolderPublicKey, testIssuer } from '../../support/fakes.js';
import { gpa, verifierA } from '../../support/harness.js';

const draft = {
  id: 'cred-1',
  issuerId: testIssuer.id,
  holderPublicKey: testHolderPublicKey,
  studentNumber: '2210001',
  fullName: 'Test Student',
  degree: 'S.Kom.',
  graduationDate: '2026-08-20',
  gpa: 375,
  issuedAt: 1_700_000_000_000,
};

const credential = (() => {
  const created = createCredential(draft);
  if (!created.ok) throw new Error('invalid test credential');
  return created.value;
})();

const input: ProofGenerationInput = {
  signedCredential: { credential, signature: 'sig' as never },
  holderPrivateKey: asHolderPrivateKey('sk'),
  request: { verifierId: verifierA, challenge: asChallengeValue('c1'), gpaThreshold: gpa(300) },
};

describe('thresholdVariant', () => {
  it('feeds the private GPA and the public threshold to the circuit as decimal strings', () => {
    expect(thresholdVariant.circuitInputs(input)).toEqual({ gpa: '375', gpaThreshold: '300' });
  });

  it('expects the threshold as the only public signal', () => {
    const claims: PublicSignals = {
      issuerPublicKey: asIssuerPublicKey('pk'),
      gpaThreshold: gpa(300),
      challenge: asChallengeValue('c1'),
      verifierId: asVerifierId('v'),
    };
    expect(thresholdVariant.expectedPublicSignals(claims)).toEqual(['300']);
  });
});

describe('circuitArtifactPaths', () => {
  it('keeps every artifact of a variant in its own directory', () => {
    const paths = circuitArtifactPaths('threshold', '/artifacts');
    expect(paths.wasm).toBe(join('/artifacts', 'threshold', 'threshold_js', 'threshold.wasm'));
    expect(paths.zkey).toBe(join('/artifacts', 'threshold', 'threshold.zkey'));
    expect(paths.verificationKey).toBe(join('/artifacts', 'threshold', 'verification_key.json'));
  });
});

describe('createSnarkjsProofEngine', () => {
  it('fails fast and points at the setup script when artifacts are missing', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'zk-credential-empty-'));
    try {
      const creation = createSnarkjsProofEngine({
        variant: thresholdVariant,
        issuers: createStaticIssuerRegistry([testIssuer]),
        artifactsDir: emptyDir,
      });
      await expect(creation).rejects.toBeInstanceOf(InfrastructureError);
      await expect(creation).rejects.toThrow(/pnpm setup:zk/);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });
});
