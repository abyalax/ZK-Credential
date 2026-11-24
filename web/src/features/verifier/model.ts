import { atom } from 'jotai';
import { makeIssueChallenge, makeVerifyPresentation } from '@/application';
import type { ChallengeView, Outcome, ProofView } from '@/domain';
import { containerOf } from '../container';
import { type Async, failed, IDLE, LOADING } from '../shared/async';
import { presentationInboxAtom } from '../shared/state';

export const VERIFIER_ID = 'verifier-a';
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Scaled by 100. */
export const requiredThresholdAtom = atom(350);
export const challengesAtom = atom<readonly ChallengeView[]>([]);
export const pastedProofAtom = atom('');
export const resultAtom = atom<Async<Outcome & { readonly durationMs: number }>>(IDLE);

export const refreshVerifierAtom = atom(null, async (get, set) => {
  set(challengesAtom, await containerOf(get).verifier.challenges());
});

export const issueChallengeAtom = atom(null, async (get, set) => {
  const challenge = await makeIssueChallenge(containerOf(get).verifier)({ verifierId: VERIFIER_ID, ttlMs: CHALLENGE_TTL_MS });
  set(challengesAtom, (previous) => [challenge, ...previous.filter((item) => item.value !== challenge.value)]);
});

const parsePasted = (text: string): ProofView | undefined => {
  try {
    const value = JSON.parse(text) as Partial<ProofView>;
    return value.payload && value.publicSignals ? (value as ProofView) : undefined;
  } catch {
    return;
  }
};

export const verifyAtom = atom(null, async (get, set) => {
  const proof = get(presentationInboxAtom) ?? parsePasted(get(pastedProofAtom));
  if (!proof) {
    set(resultAtom, {
      status: 'error',
      message: 'Belum ada presentasi. Kirim dari halaman Holder, atau tempel JSON presentasi.',
    });
    return;
  }
  set(resultAtom, LOADING);
  try {
    const outcome = await makeVerifyPresentation(containerOf(get).verifier)({
      proof,
      verifierId: VERIFIER_ID,
      requiredThreshold: get(requiredThresholdAtom),
    });
    set(resultAtom, { status: 'done', value: outcome });
    set(presentationInboxAtom, undefined);
    set(challengesAtom, await containerOf(get).verifier.challenges());
  } catch (error) {
    set(resultAtom, failed(error));
  }
});
