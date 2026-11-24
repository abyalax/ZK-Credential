import { useAtomValue, useSetAtom } from 'jotai';
import { ABLATION_IDS, expectedOutcome } from '@/domain';
import { Button } from '@/ui/components/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/table';
import { OutcomeBadge } from '../shared/OutcomeBadge';
import { compareRowsAtom, comparingAtom, runComparisonAtom, scenarioIdAtom, scenariosAtom } from './model';

/** Ablation view: one scenario on B1-B4 in sequence, so the gap that each added mechanism closes is visible. */
export function ComparePanel() {
  const rows = useAtomValue(compareRowsAtom);
  const comparing = useAtomValue(comparingAtom);
  const run = useSetAtom(runComparisonAtom);
  const scenarios = useAtomValue(scenariosAtom);
  const scenarioId = useAtomValue(scenarioIdAtom);
  const scenario = scenarios.find((item) => item.id === scenarioId);
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        {scenario ? `“${scenario.title}” dijalankan pada B1 sampai B4 secara berurutan.` : 'Pilih skenario dulu.'}
      </p>
      <Button
        variant="outline"
        disabled={comparing || !scenario || scenario.applicableConfigurations.length < 4}
        onClick={() => run()}
      >
        {comparing ? 'Membandingkan…' : 'Bandingkan B1 sampai B4'}
      </Button>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Konfigurasi</TableHead>
            <TableHead>Hasil</TableHead>
            <TableHead>Alasan</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ABLATION_IDS.map((id) => {
            const row = rows.find((item) => item.configuration === id);
            const outcome = row?.summary?.outcome;
            const expected = scenario ? expectedOutcome(scenario, id) : 'unknown';
            return (
              <TableRow key={id}>
                <TableCell className="font-medium">{id}</TableCell>
                <TableCell>
                  {outcome ? (
                    <OutcomeBadge accepted={outcome.accepted} />
                  ) : (
                    <span className="text-muted-foreground">
                      {row?.error ?? (expected === 'unknown' ? '-' : 'Belum dijalankan')}
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{outcome?.reason ?? ''}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
