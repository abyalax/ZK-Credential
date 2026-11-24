import { atom } from 'jotai';
import { makeCreateProof } from '@/application';
import type { ChallengeView, CredentialView, ProofView } from '@/domain';
import { containerOf } from '../container';
import { type Async, failed, IDLE, LOADING } from '../shared/async';
import { PROOF_ERROR_COPY } from '../shared/copy';
import { presentationInboxAtom } from '../shared/state';

export const walletAtom = atom<readonly CredentialView[]>([]);
export const openChallengesAtom = atom<readonly ChallengeView[]>([]);
export const selectedCredentialIdAtom = atom<string | undefined>(undefined);
export const selectedChallengeAtom = atom<string | undefined>(undefined);
/** Scaled by 100. */
export const thresholdAtom = atom(350);
export const proofStateAtom = atom<Async<ProofView>>(IDLE);

export const refreshHolderAtom = atom(null, async (get, set) => {
  const { holder, verifier } = containerOf(get);
  const [wallet, challenges] = await Promise.all([holder.credentials(), verifier.challenges()]);
  set(walletAtom, wallet);
  set(
    openChallengesAtom,
    challenges.filter((challenge) => challenge.status === 'issued'),
  );
  if (!get(selectedCredentialIdAtom)) set(selectedCredentialIdAtom, wallet[0]?.id);
});

export const createProofAtom = atom(null, async (get, set) => {
  const credentialId = get(selectedCredentialIdAtom);
  const challenge = get(openChallengesAtom).find((item) => item.value === get(selectedChallengeAtom));
  if (!(credentialId && challenge)) {
    set(proofStateAtom, { status: 'error', message: 'Pilih kredensial dan challenge dulu.' });
    return;
  }
  set(proofStateAtom, LOADING);
  try {
    const result = await makeCreateProof(containerOf(get).holder)({
      credentialId,
      challenge: challenge.value,
      verifierId: challenge.verifierId,
      threshold: get(thresholdAtom),
    });
    set(
      proofStateAtom,
      result.ok ? { status: 'done', value: result.value } : { status: 'error', message: PROOF_ERROR_COPY[result.error] },
    );
  } catch (error) {
    set(proofStateAtom, failed(error));
  }
});

export const sendPresentationAtom = atom(null, (get, set) => {
  const state = get(proofStateAtom);
  if (state.status === 'done') set(presentationInboxAtom, state.value);
});
