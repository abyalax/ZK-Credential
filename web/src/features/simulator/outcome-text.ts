import { expectedOutcome, explainReason, type RunEvent, type RunSummary, rejectingNode, type Scenario } from '@/domain';
import { formatMs } from '@/shared';
import { NODE_LABEL, stepLabel } from './step-labels';

export interface OutcomeView {
  readonly variant: 'accepted' | 'rejected' | 'pending';
  readonly accepted: boolean;
  readonly title: string;
  readonly body: string;
}

interface Input {
  readonly summary: RunSummary;
  readonly scenario: Scenario | undefined;
  readonly applied: readonly RunEvent[];
}

const rejectedAt = ({ summary, applied }: Input): string => {
  const last = applied.findLast((event) => event.status === 'rejected');
  return last ? `${NODE_LABEL[last.node]}, langkah “${stepLabel(last.step)}”` : NODE_LABEL[rejectingNode(summary.outcome.reason)];
};

const expectation = ({ summary, scenario }: Input): string => {
  const expected = scenario ? expectedOutcome(scenario, summary.configuration) : 'unknown';
  if (expected === 'unknown') return '';
  return ` Hasil ${(expected === 'accepted') === summary.outcome.accepted ? 'sesuai' : 'berbeda dari'} ekspektasi katalog.`;
};

const GAP_TEXT =
  'Circuit pada konfigurasi ini belum mengikat masukan yang diserang. Ini celah ablation yang terdokumentasi, bukan kesalahan.';

/** An attack that is accepted is a documented ablation gap (B1-B3), shown apart from a plain acceptance. */
export const describeOutcome = (input: Input): OutcomeView => {
  const { summary, scenario } = input;
  const { accepted, reason } = summary.outcome;
  const tail = `Total ${formatMs(summary.totalMs)}.${expectation(input)}`;
  if (scenario?.kind === 'attack' && accepted) {
    return { variant: 'pending', accepted, title: `Serangan lolos pada ${summary.configuration}`, body: `${GAP_TEXT} ${tail}` };
  }
  if (accepted) return { variant: 'accepted', accepted, title: 'Diterima', body: `${explainReason(reason)} ${tail}` };
  return {
    variant: 'rejected',
    accepted,
    title: `Ditolak: ${reason}`,
    body: `${explainReason(reason)} Ditolak di ${rejectedAt(input)}. ${tail}`,
  };
};
