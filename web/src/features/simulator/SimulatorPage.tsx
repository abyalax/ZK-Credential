import { useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/components/tabs';
import { PageHeader } from '../shared/PageHeader';
import { ComparePanel } from './ComparePanel';
import { ControlsBar } from './ControlsBar';
import { EventLog } from './EventLog';
import { FlowCanvas } from './FlowCanvas';
import { KnowledgePanel } from './KnowledgePanel';
import { loadScenariosAtom, stopRunAtom } from './model';
import { OutcomeBanner } from './OutcomeBanner';

export function SimulatorPage() {
  const load = useSetAtom(loadScenariosAtom);
  const stop = useSetAtom(stopRunAtom);
  useEffect(() => {
    load();
    return () => stop();
  }, [load, stop]);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Simulator"
        description="Graf tetap dengan eksekusi realtime. Pilih konfigurasi dan skenario, lalu lihat node mana yang menolak dan kenapa."
      />
      <ControlsBar />
      <OutcomeBanner />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <FlowCanvas />
        <Tabs defaultValue="log" className="rounded-lg border bg-card p-4">
          <TabsList>
            <TabsTrigger value="log">Langkah</TabsTrigger>
            <TabsTrigger value="knowledge">Yang diketahui verifier</TabsTrigger>
            <TabsTrigger value="compare">Bandingkan</TabsTrigger>
          </TabsList>
          <TabsContent value="log">
            <EventLog />
          </TabsContent>
          <TabsContent value="knowledge">
            <KnowledgePanel />
          </TabsContent>
          <TabsContent value="compare">
            <ComparePanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
