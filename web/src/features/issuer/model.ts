import { atom } from 'jotai';
import { makeIssueCredential } from '@/application';
import type { CredentialView, IssueCredentialInput, IssuerView } from '@/domain';
import { containerOf } from '../container';
import { type Async, failed, IDLE, LOADING } from '../shared/async';
import { ISSUE_ERROR_COPY } from '../shared/copy';

export const issuerProfileAtom = atom<IssuerView | undefined>(undefined);
export const issuedAtom = atom<readonly CredentialView[]>([]);
export const issueStateAtom = atom<Async<CredentialView>>(IDLE);

export const refreshIssuerAtom = atom(null, async (get, set) => {
  const { issuer } = containerOf(get);
  const [profile, issued] = await Promise.all([issuer.profile(), issuer.issued()]);
  set(issuerProfileAtom, profile);
  set(issuedAtom, issued);
});

export const issueCredentialAtom = atom(null, async (get, set, input: IssueCredentialInput) => {
  set(issueStateAtom, LOADING);
  try {
    const result = await makeIssueCredential(containerOf(get).issuer)(input);
    if (!result.ok) {
      set(issueStateAtom, { status: 'error', message: ISSUE_ERROR_COPY[result.error] });
      return;
    }
    set(issuedAtom, (previous) => [result.value, ...previous.filter((item) => item.id !== result.value.id)]);
    set(issueStateAtom, { status: 'done', value: result.value });
  } catch (error) {
    set(issueStateAtom, failed(error));
  }
});
