import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Play, SkipForward, Square } from 'lucide-react';
import { CATEGORY_LABEL, CONFIGURATIONS, type ConfigurationId, groupByCategory, isApplicable } from '@/domain';
import { Button } from '@/ui/components/button';
import { Label } from '@/ui/components/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/ui/components/select';
import { Switch } from '@/ui/components/switch';
import {
  configurationAtom,
  nextStepAtom,
  playbackAtom,
  runAtom,
  scenarioIdAtom,
  scenariosAtom,
  setPlaybackModeAtom,
  startRunAtom,
  stopRunAtom,
} from './model';

export function ControlsBar() {
  const [configuration, setConfiguration] = useAtom(configurationAtom);
  const [scenarioId, setScenarioId] = useAtom(scenarioIdAtom);
  const scenarios = useAtomValue(scenariosAtom);
  const run = useAtomValue(runAtom);
  const playback = useAtomValue(playbackAtom);
  const start = useSetAtom(startRunAtom);
  const stop = useSetAtom(stopRunAtom);
  const next = useSetAtom(nextStepAtom);
  const setMode = useSetAtom(setPlaybackModeAtom);
  const running = run.status === 'running';
  const stepping = playback.mode === 'step';

  const changeConfiguration = (value: string) => {
    const id = value as ConfigurationId;
    setConfiguration(id);
    const current = scenarios.find((scenario) => scenario.id === scenarioId);
    if (current && !isApplicable(current, id)) setScenarioId('valid-accepted');
  };

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4">
      <div className="grid w-full gap-1.5 sm:w-72">
        <Label>Konfigurasi</Label>
        <Select value={configuration} onValueChange={changeConfiguration} disabled={running}>
          <SelectTrigger aria-label="Konfigurasi">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONFIGURATIONS.map(({ id, label }) => (
              <SelectItem key={id} value={id}>
                {id} · {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid w-full gap-1.5 sm:w-96">
        <Label>Skenario</Label>
        <Select value={scenarioId} onValueChange={setScenarioId} disabled={running}>
          <SelectTrigger aria-label="Skenario">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groupByCategory(scenarios).map(([category, list]) => (
              <SelectGroup key={category}>
                <SelectLabel>{CATEGORY_LABEL[category]}</SelectLabel>
                {list.map((scenario) => (
                  <SelectItem key={scenario.id} value={scenario.id} disabled={!isApplicable(scenario, configuration)}>
                    {scenario.title}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2 pb-1.5">
        <Switch id="step-mode" checked={stepping} onCheckedChange={(checked) => setMode(checked ? 'step' : 'auto')} />
        <Label htmlFor="step-mode">Langkah per langkah</Label>
      </div>
      <div className="ml-auto flex gap-2">
        {stepping && (
          <Button variant="outline" onClick={() => next()} disabled={playback.pending.length === 0}>
            <SkipForward /> Langkah berikutnya
          </Button>
        )}
        {running ? (
          <Button variant="destructive" onClick={() => stop()}>
            <Square /> Hentikan
          </Button>
        ) : (
          <Button onClick={() => start()} disabled={scenarios.length === 0}>
            <Play /> Jalankan
          </Button>
        )}
      </div>
    </div>
  );
}
