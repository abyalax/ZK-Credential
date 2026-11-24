import { atom } from 'jotai';
import type { ProofView } from '@/domain';

/** The presentation the holder sent in this tab; the verifier page picks it up. Other tabs use copy and paste. */
export const presentationInboxAtom = atom<ProofView | undefined>(undefined);
