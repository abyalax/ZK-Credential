import { describe, expect, it } from 'vitest';
import {
  generateSdJwtKeyPair,
  issueSdJwt,
  peekKeyBinding,
  presentSdJwt,
  verifySdJwtPresentation,
} from '../../../src/infrastructure/index.js';

const issuerKeys = generateSdJwtKeyPair();
const holderKeys = generateSdJwtKeyPair();
const trusted = new Map([['issuer-test', issuerKeys.publicKey]]);

const issue = () =>
  issueSdJwt({
    issuer: 'issuer-test',
    issuerPrivateKey: issuerKeys.privateKey,
    holderPublicKey: holderKeys.publicKey,
    claims: { fullName: 'Test Student', degree: 'S.Kom.', gpa: 375 },
    issuedAt: 1_700_000_000,
  });

const present = (disclose: readonly string[] = ['gpa'], nonce = 'n-1', audience = 'verifier-a') =>
  presentSdJwt({
    sdJwt: issue(),
    disclose,
    holderPrivateKey: holderKeys.privateKey,
    nonce,
    audience,
    issuedAt: 1_700_000_100,
  });

const verify = (presentation: string, nonce = 'n-1', audience = 'verifier-a') =>
  verifySdJwtPresentation({ presentation, trustedIssuers: trusted, expectedAudience: audience, expectedNonce: nonce });

describe('SD-JWT baseline', () => {
  it('reveals only the chosen claims', () => {
    const result = verify(present(['gpa']));
    expect(result).toEqual({ ok: true, value: { issuer: 'issuer-test', disclosed: { gpa: 375 } } });
  });

  it('rejects a presentation without key binding', () => {
    expect(verify(issue())).toEqual({ ok: false, error: 'KEY_BINDING_MISSING' });
  });

  it('rejects a changed disclosure', () => {
    const forged = Buffer.from(JSON.stringify(['salt', 'gpa', 390])).toString('base64url');
    const [jwt, , keyBinding] = present(['gpa']).split('~');
    expect(verify(`${jwt}~${forged}~${keyBinding}`)).toEqual({ ok: false, error: 'DISCLOSURE_INVALID' });
  });

  it('rejects an unregistered issuer', () => {
    const rogue = generateSdJwtKeyPair();
    const sdJwt = issueSdJwt({
      issuer: 'issuer-test',
      issuerPrivateKey: rogue.privateKey,
      holderPublicKey: holderKeys.publicKey,
      claims: { gpa: 375 },
      issuedAt: 1,
    });
    const presentation = presentSdJwt({
      sdJwt,
      disclose: ['gpa'],
      holderPrivateKey: holderKeys.privateKey,
      nonce: 'n-1',
      audience: 'verifier-a',
      issuedAt: 2,
    });
    expect(verify(presentation)).toEqual({ ok: false, error: 'ISSUER_SIGNATURE_INVALID' });
  });
});

describe('SD-JWT baseline: holder and replay binding', () => {
  it('rejects a presenter without the holder key', () => {
    const attacker = generateSdJwtKeyPair();
    const presentation = presentSdJwt({
      sdJwt: issue(),
      disclose: ['gpa'],
      holderPrivateKey: attacker.privateKey,
      nonce: 'n-1',
      audience: 'verifier-a',
      issuedAt: 2,
    });
    expect(verify(presentation)).toEqual({ ok: false, error: 'KEY_BINDING_INVALID' });
  });

  it('binds the presentation to nonce and audience', () => {
    const presentation = present();
    expect(verify(presentation, 'n-2')).toEqual({ ok: false, error: 'NONCE_MISMATCH' });
    expect(verify(presentation, 'n-1', 'verifier-b')).toEqual({ ok: false, error: 'AUDIENCE_MISMATCH' });
    expect(peekKeyBinding(presentation)).toEqual({ nonce: 'n-1', audience: 'verifier-a' });
  });

  it('rejects a presentation whose disclosures were swapped after signing the key binding', () => {
    const [jwt, , keyBinding] = present(['gpa']).split('~');
    const allDisclosures = issue().split('~').slice(1, -1);
    expect(verify(`${jwt}~${allDisclosures[0]}~${keyBinding}`)).toMatchObject({ ok: false });
  });

  it('rejects malformed input', () => {
    expect(verify('not-an-sd-jwt')).toEqual({ ok: false, error: 'SD_JWT_MALFORMED' });
  });
});
