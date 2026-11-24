import { atom, type Getter } from 'jotai';
import type { Container } from '@/application';

/** Set once by the composition root (`app/`). Features reach the server only through these ports. */
export const containerAtom = atom<Container | undefined>(undefined);

export const containerOf = (get: Getter): Container => {
  const container = get(containerAtom);
  if (!container) throw new Error('Container belum dipasang oleh composition root');
  return container;
};
