import { useAtom, useAtomValue } from 'jotai';
import type { ReactNode } from 'react';
import { containerAtom, HolderPage, IssuerPage, SimulatorPage, VerifierPage } from '@/features';
import { cn } from '@/ui/lib/cn';
import { DemoLimits } from './DemoLimits';
import { ROUTES, type RouteId, routeAtom } from './route';

const PAGES: Record<RouteId, () => ReactNode> = {
  simulator: () => <SimulatorPage />,
  issuer: () => <IssuerPage />,
  holder: () => <HolderPage />,
  verifier: () => <VerifierPage />,
};

function Nav({ replay }: { readonly replay: boolean }) {
  const [route, setRoute] = useAtom(routeAtom);
  const link = (id: RouteId, label: string) => (
    <button
      key={id}
      type="button"
      aria-current={route === id ? 'page' : undefined}
      onClick={() => setRoute(id)}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        route === id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
      )}
    >
      {label}
    </button>
  );
  return (
    <nav aria-label="Halaman" className="flex flex-wrap items-center gap-1">
      {link('simulator', 'Simulator')}
      {!replay && (
        <>
          <span className="mx-2 h-5 w-px bg-border" aria-hidden />
          <span className="mr-1 text-sm text-muted-foreground">Coba sendiri:</span>
          {ROUTES.filter((item) => item.group === 'role').map((item) => link(item.id, item.label))}
        </>
      )}
    </nav>
  );
}

export function App() {
  const route = useAtomValue(routeAtom);
  const container = useAtomValue(containerAtom);
  // The role pages need a live server, so a replay always shows the simulator.
  const page = container?.mode === 'replay' ? 'simulator' : route;
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <span className="font-serif text-xl font-semibold">ZK-Credential</span>
          <Nav replay={container?.mode === 'replay'} />
        </div>
      </header>
      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-8">
        {PAGES[page]()}
        {container && <DemoLimits container={container} />}
      </main>
    </div>
  );
}
