import { describe, expect, it } from 'vitest';
import { createCredential, satisfiesGpaThreshold, toGpa } from '../../../src/domain/index.js';

const draft = {
  id: 'c-1',
  issuerId: 'issuer-1',
  holderPublicKey: 'holder-pk',
  studentNumber: '2210001',
  fullName: 'Test Student',
  degree: 'S.Kom.',
  graduationDate: '2026-08-20',
  gpa: 375,
  issuedAt: 1,
};

describe('createCredential', () => {
  it('accepts a valid draft', () => {
    expect(createCredential(draft).ok).toBe(true);
  });

  it.each([-1, 401, 3.5, Number.NaN])('rejects GPA %s', (gpa) => {
    expect(createCredential({ ...draft, gpa })).toEqual({ ok: false, error: 'GPA_OUT_OF_RANGE' });
  });

  it('rejects blank required fields', () => {
    expect(createCredential({ ...draft, fullName: '  ' })).toEqual({
      ok: false,
      error: 'REQUIRED_FIELD_EMPTY',
    });
  });

  it.each(['20-08-2026', '2026-02-30', ''])('rejects graduation date "%s"', (graduationDate) => {
    expect(createCredential({ ...draft, graduationDate })).toEqual({
      ok: false,
      error: 'GRADUATION_DATE_INVALID',
    });
  });
});

describe('satisfiesGpaThreshold', () => {
  it('is inclusive at the threshold', () => {
    const created = createCredential(draft);
    const threshold = toGpa(375);
    if (!(created.ok && threshold.ok)) throw new Error('setup failed');
    expect(satisfiesGpaThreshold(created.value, threshold.value)).toBe(true);
  });
});
