import { useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { usePolling } from '../shared/hooks';
import { PageHeader } from '../shared/PageHeader';
import { IssueForm } from './IssueForm';
import { IssuedList, IssuerProfileCard } from './IssuerSidebar';
import { refreshIssuerAtom } from './model';

export function IssuerPage() {
  const refresh = useSetAtom(refreshIssuerAtom);
  usePolling(useCallback(() => refresh(), [refresh]));
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Issuer"
        description="Institusi menerbitkan kredensial dan menandatanganinya. Holder menerima kredensial di wallet-nya."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <IssueForm />
        <div className="grid content-start gap-6">
          <IssuerProfileCard />
          <IssuedList />
        </div>
      </div>
    </div>
  );
}
