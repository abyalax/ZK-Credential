import { useAtomValue } from 'jotai';
import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/ui/components/alert';
import { playbackAtom, runAtom, scenariosAtom } from './model';
import { describeOutcome } from './outcome-text';

const errorText = (message: string): string =>
  message === 'RUN_IN_PROGRESS' ? 'Server sedang menjalankan simulasi lain. Tunggu sampai selesai.' : message;

export function OutcomeBanner() {
  const run = useAtomValue(runAtom);
  const playback = useAtomValue(playbackAtom);
  const scenarios = useAtomValue(scenariosAtom);

  if (run.status === 'error') {
    return (
      <Alert variant="rejected">
        <TriangleAlert />
        <AlertTitle>Run gagal</AlertTitle>
        <AlertDescription>{errorText(run.message)}</AlertDescription>
      </Alert>
    );
  }
  if (run.status !== 'completed' || playback.pending.length > 0) return null;

  const scenario = scenarios.find((item) => item.id === run.summary.scenarioId);
  const view = describeOutcome({ summary: run.summary, scenario, applied: playback.applied });
  return (
    <Alert variant={view.variant}>
      {view.accepted ? <CircleCheck /> : <CircleX />}
      <AlertTitle>{view.title}</AlertTitle>
      <AlertDescription>{view.body}</AlertDescription>
    </Alert>
  );
}
