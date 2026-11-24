import { useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { usePolling } from '../shared/hooks';
import { PageHeader } from '../shared/PageHeader';
import { DisclosureCard } from './DisclosureCard';
import { refreshHolderAtom } from './model';
import { ProofCard } from './ProofCard';
import { WalletCard } from './WalletCard';

export function HolderPage() {
  const refresh = useSetAtom(refreshHolderAtom);
  usePolling(useCallback(() => refresh(), [refresh]));
  return (
    <div className="grid gap-6">
      <PageHeader title="Holder" description="Mahasiswa menyimpan kredensial dan membuktikan IPK tanpa membuka nilai aslinya." />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-6">
          <WalletCard />
          <ProofCard />
        </div>
        <DisclosureCard />
      </div>
    </div>
  );
}
