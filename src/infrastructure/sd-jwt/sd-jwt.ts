import { createHash, createPublicKey, generateKeyPairSync, type KeyObject, randomBytes, sign, verify } from 'node:crypto';
import type { Result } from '../../shared/index.js';
import { err, ok } from '../../shared/index.js';

/**
 * Minimal SD-JWT (IETF draft) with key binding, used as the non-ZKP comparison baseline (D8, D9).
 * Signature algorithm: EdDSA (Ed25519). Digest algorithm: SHA-256.
 * Scope: issuance, presentation with selective disclosure, and verification. No revocation (D7).
 */

const ISSUER_JWT_TYP = 'dc+sd-jwt';
const KEY_BINDING_TYP = 'kb+jwt';
const SD_ALG = 'sha-256';
const SALT_BYTES = 16;

export type SdJwtClaims = Readonly<Record<string, string | number>>;

export type SdJwtRejection =
  | 'SD_JWT_MALFORMED'
  | 'ISSUER_NOT_REGISTERED'
  | 'ISSUER_SIGNATURE_INVALID'
  | 'DISCLOSURE_INVALID'
  | 'KEY_BINDING_MISSING'
  | 'KEY_BINDING_INVALID'
  | 'KEY_BINDING_HASH_MISMATCH'
  | 'AUDIENCE_MISMATCH'
  | 'NONCE_MISMATCH';

export interface SdJwtKeyPair {
  readonly publicKey: KeyObject;
  readonly privateKey: KeyObject;
}

export const generateSdJwtKeyPair = (): SdJwtKeyPair => generateKeyPairSync('ed25519');

const base64url = (value: Uint8Array | string): string =>
  (typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value)).toString('base64url');
const fromBase64url = (value: string): Buffer => Buffer.from(value, 'base64url');
const sha256 = (value: string): string => base64url(createHash('sha256').update(value, 'ascii').digest());
const encodeJson = (value: unknown): string => base64url(JSON.stringify(value));

const decodeJson = (value: string): Record<string, unknown> | undefined => {
  try {
    const parsed: unknown = JSON.parse(fromBase64url(value).toString('utf8'));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
};

const signJwt = (header: object, payload: object, privateKey: KeyObject): string => {
  const signingInput = `${encodeJson(header)}.${encodeJson(payload)}`;
  return `${signingInput}.${base64url(sign(null, Buffer.from(signingInput, 'ascii'), privateKey))}`;
};

interface ParsedJwt {
  readonly header: Record<string, unknown>;
  readonly payload: Record<string, unknown>;
  readonly signingInput: string;
  readonly signature: Buffer;
}

const parseJwt = (jwt: string): ParsedJwt | undefined => {
  const parts = jwt.split('.');
  if (parts.length !== 3) return;
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const header = decodeJson(headerPart);
  const payload = decodeJson(payloadPart);
  if (!(header && payload)) return;
  return { header, payload, signingInput: `${headerPart}.${payloadPart}`, signature: fromBase64url(signaturePart) };
};

const verifyJwtSignature = (jwt: ParsedJwt, publicKey: KeyObject): boolean => {
  try {
    return jwt.header.alg === 'EdDSA' && verify(null, Buffer.from(jwt.signingInput, 'ascii'), publicKey, jwt.signature);
  } catch {
    return false;
  }
};

const publicKeyToJwk = (publicKey: KeyObject) => publicKey.export({ format: 'jwk' });

const jwkToPublicKey = (jwk: unknown): KeyObject | undefined => {
  if (typeof jwk !== 'object' || jwk === null) return;
  try {
    return createPublicKey({ key: jwk as Record<string, string | undefined>, format: 'jwk' });
  } catch {}
};

export interface IssueSdJwtInput {
  readonly issuer: string;
  readonly issuerPrivateKey: KeyObject;
  readonly holderPublicKey: KeyObject;
  /** Every claim becomes an individually disclosable claim. */
  readonly claims: SdJwtClaims;
  /** Epoch seconds. */
  readonly issuedAt: number;
  readonly randomBytes?: (size: number) => Uint8Array;
}

/** Issuer side. Returns `<jwt>~<disclosure>~...~` (a trailing `~` marks "no key-binding JWT yet"). */
export const issueSdJwt = (input: IssueSdJwtInput): string => {
  const random = input.randomBytes ?? randomBytes;
  const disclosures = Object.entries(input.claims).map(([name, value]) =>
    encodeJson([base64url(random(SALT_BYTES)), name, value]),
  );
  const payload = {
    iss: input.issuer,
    iat: input.issuedAt,
    vct: 'AcademicDiploma',
    _sd_alg: SD_ALG,
    _sd: disclosures.map(sha256).sort(),
    cnf: { jwk: publicKeyToJwk(input.holderPublicKey) },
  };
  const jwt = signJwt({ alg: 'EdDSA', typ: ISSUER_JWT_TYP }, payload, input.issuerPrivateKey);
  return `${[jwt, ...disclosures].join('~')}~`;
};

export interface PresentSdJwtInput {
  readonly sdJwt: string;
  /** Claim names to reveal; every other claim stays hidden. */
  readonly disclose: readonly string[];
  readonly holderPrivateKey: KeyObject;
  readonly nonce: string;
  readonly audience: string;
  /** Epoch seconds. */
  readonly issuedAt: number;
}

const disclosureName = (disclosure: string): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(fromBase64url(disclosure).toString('utf8'));
    return Array.isArray(parsed) && typeof parsed[1] === 'string' ? parsed[1] : undefined;
  } catch {
    return undefined;
  }
};

/** Holder side: keeps the chosen disclosures and appends a key-binding JWT over the presentation. */
export const presentSdJwt = (input: PresentSdJwtInput): string => {
  const [jwt = '', ...rest] = input.sdJwt.split('~');
  const wanted = new Set(input.disclose);
  const kept = rest.filter((part) => part !== '' && wanted.has(disclosureName(part) ?? ''));
  const prefix = `${[jwt, ...kept].join('~')}~`;
  const keyBinding = signJwt(
    { alg: 'EdDSA', typ: KEY_BINDING_TYP },
    { iat: input.issuedAt, aud: input.audience, nonce: input.nonce, sd_hash: sha256(prefix) },
    input.holderPrivateKey,
  );
  return `${prefix}${keyBinding}`;
};

export interface KeyBindingClaims {
  readonly nonce: string;
  readonly audience: string;
}

/** Reads (without verifying) the nonce and audience a presentation claims, for the cheap pre-checks. */
export const peekKeyBinding = (presentation: string): KeyBindingClaims | undefined => {
  const keyBinding = parseJwt(presentation.split('~').at(-1) ?? '');
  const { nonce, aud } = keyBinding?.payload ?? {};
  return typeof nonce === 'string' && typeof aud === 'string' ? { nonce, audience: aud } : undefined;
};

export interface VerifySdJwtInput {
  readonly presentation: string;
  /** Registered issuers by `iss` value. */
  readonly trustedIssuers: ReadonlyMap<string, KeyObject>;
  readonly expectedAudience: string;
  readonly expectedNonce: string;
}

export interface VerifiedSdJwt {
  readonly issuer: string;
  readonly disclosed: SdJwtClaims;
}

const reconstructClaims = (disclosures: readonly string[], digests: readonly unknown[]): SdJwtClaims | undefined => {
  const known = new Set(digests);
  const seen = new Set<string>();
  const claims: Record<string, string | number> = {};
  for (const disclosure of disclosures) {
    const digest = sha256(disclosure);
    if (!known.has(digest) || seen.has(digest)) return;
    seen.add(digest);
    let parsed: unknown;
    try {
      parsed = JSON.parse(fromBase64url(disclosure).toString('utf8'));
    } catch {
      return;
    }
    if (!Array.isArray(parsed) || parsed.length !== 3) return;
    const [, name, value] = parsed as [unknown, unknown, unknown];
    if (typeof name !== 'string' || (typeof value !== 'string' && typeof value !== 'number') || name in claims) return;
    claims[name] = value;
  }
  return claims;
};

interface IssuerChecked {
  readonly issuer: string;
  readonly payload: Record<string, unknown>;
  readonly disclosed: SdJwtClaims;
}

const verifyIssuerPart = (
  jwtPart: string,
  disclosures: readonly string[],
  trustedIssuers: ReadonlyMap<string, KeyObject>,
): Result<IssuerChecked, SdJwtRejection> => {
  const jwt = parseJwt(jwtPart);
  if (!jwt || jwt.header.typ !== ISSUER_JWT_TYP || jwt.payload._sd_alg !== SD_ALG) return err('SD_JWT_MALFORMED');

  const issuer = typeof jwt.payload.iss === 'string' ? jwt.payload.iss : undefined;
  const issuerKey = issuer === undefined ? undefined : trustedIssuers.get(issuer);
  if (issuer === undefined || !issuerKey) return err('ISSUER_NOT_REGISTERED');
  if (!verifyJwtSignature(jwt, issuerKey)) return err('ISSUER_SIGNATURE_INVALID');

  const digests = jwt.payload._sd;
  if (!Array.isArray(digests)) return err('SD_JWT_MALFORMED');
  const disclosed = reconstructClaims(disclosures, digests);
  if (!disclosed) return err('DISCLOSURE_INVALID');
  return ok({ issuer, payload: jwt.payload, disclosed });
};

interface KeyBindingExpectation {
  readonly keyBindingPart: string;
  readonly signedPrefix: string;
  readonly holderJwk: unknown;
  readonly audience: string;
  readonly nonce: string;
}

const verifyKeyBindingPart = (input: KeyBindingExpectation): SdJwtRejection | undefined => {
  const holderKey = jwkToPublicKey(input.holderJwk);
  const keyBinding = parseJwt(input.keyBindingPart);
  if (!(holderKey && keyBinding) || keyBinding.header.typ !== KEY_BINDING_TYP) return 'KEY_BINDING_INVALID';
  if (!verifyJwtSignature(keyBinding, holderKey)) return 'KEY_BINDING_INVALID';
  if (keyBinding.payload.sd_hash !== sha256(input.signedPrefix)) return 'KEY_BINDING_HASH_MISMATCH';
  if (keyBinding.payload.aud !== input.audience) return 'AUDIENCE_MISMATCH';
  if (keyBinding.payload.nonce !== input.nonce) return 'NONCE_MISMATCH';
};

/** Verifier side: pure cryptographic and structural checks. Challenge-store rules live outside. */
export const verifySdJwtPresentation = (input: VerifySdJwtInput): Result<VerifiedSdJwt, SdJwtRejection> => {
  const parts = input.presentation.split('~');
  if (parts.length < 2) return err('SD_JWT_MALFORMED');
  const keyBindingPart = parts.at(-1) ?? '';
  if (keyBindingPart === '') return err('KEY_BINDING_MISSING');
  const [jwtPart = '', ...disclosures] = parts.slice(0, -1);

  const issuerChecked = verifyIssuerPart(jwtPart, disclosures, input.trustedIssuers);
  if (!issuerChecked.ok) return issuerChecked;

  const rejection = verifyKeyBindingPart({
    keyBindingPart,
    signedPrefix: `${parts.slice(0, -1).join('~')}~`,
    holderJwk: (issuerChecked.value.payload.cnf as { jwk?: unknown } | undefined)?.jwk,
    audience: input.expectedAudience,
    nonce: input.expectedNonce,
  });
  if (rejection) return err(rejection);

  return ok({ issuer: issuerChecked.value.issuer, disclosed: issuerChecked.value.disclosed });
};
