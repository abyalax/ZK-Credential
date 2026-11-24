import { atom } from 'jotai';

export const ROUTES = [
  { id: 'simulator', label: 'Simulator', group: 'mode' },
  { id: 'issuer', label: 'Issuer', group: 'role' },
  { id: 'holder', label: 'Holder', group: 'role' },
  { id: 'verifier', label: 'Verifier', group: 'role' },
] as const;
export type RouteId = (typeof ROUTES)[number]['id'];

const parse = (hash: string): RouteId => ROUTES.find((route) => `#/${route.id}` === hash)?.id ?? 'simulator';

const baseAtom = atom<RouteId>(parse(window.location.hash));
baseAtom.onMount = (set) => {
  const listener = () => set(parse(window.location.hash));
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
};

/** Hash routing keeps the demo a static page: `#/issuer`, `#/holder`, `#/verifier`, `#/simulator`. */
export const routeAtom = atom(
  (get) => get(baseAtom),
  (_get, set, next: RouteId) => {
    window.location.hash = `/${next}`;
    set(baseAtom, next);
  },
);
