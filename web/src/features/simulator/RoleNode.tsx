import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import { Blocks, CircleCheck, CircleX, GraduationCap, ShieldCheck, Wallet } from 'lucide-react';
import type { GraphNodeState, NodeId } from '@/domain';
import { explainReason } from '@/domain';
import { formatGas, formatMs } from '@/shared';
import { cn } from '@/ui/lib/cn';
import { stepLabel } from './step-labels';

export type RoleNodeData = { id: NodeId; label: string; caption: string; state: GraphNodeState } & Record<string, unknown>;
export type RoleFlowNode = Node<RoleNodeData, 'role'>;

const ICONS = { issuer: GraduationCap, holder: Wallet, verifier: ShieldCheck, contract: Blocks } as const;

const FRAME: Record<GraphNodeState['status'], string> = {
  idle: 'border-border',
  active: 'border-running node-active',
  done: 'border-accepted/60',
  rejected: 'border-rejected bg-rejected-soft',
};

/** Twelve invisible handles: each side has a source and a target so edges can leave and enter at fixed spots. */
const HANDLES: readonly { id: string; position: Position; offset?: string }[] = [
  { id: 'l', position: Position.Left },
  { id: 'r', position: Position.Right },
  { id: 'tl', position: Position.Top, offset: '30%' },
  { id: 'tr', position: Position.Top, offset: '70%' },
  { id: 'bl', position: Position.Bottom, offset: '30%' },
  { id: 'br', position: Position.Bottom, offset: '70%' },
];

/** The gas is the P6 figure for `verifyCredential`, not something this run measured. */
function GasLine({ gas }: { readonly gas: number }) {
  return (
    <p
      className="mt-1 text-xs"
      title="estimateGas dari CredentialVerifier.verifyCredential pada hasil P6 (B4). Bukan pengukuran run ini."
    >
      <span className="font-medium tabular-nums">Gas {formatGas(gas)}</span>
      <span className="text-muted-foreground"> · referensi P6</span>
    </p>
  );
}

export function RoleNode({ data }: NodeProps<RoleFlowNode>) {
  const Icon = ICONS[data.id];
  const { state } = data;
  return (
    <div className={cn('w-64 rounded-lg border-2 bg-card p-3 transition-colors', FRAME[state.status])}>
      {HANDLES.flatMap(({ id, position, offset }) =>
        (['source', 'target'] as const).map((type) => (
          <Handle
            key={`${id}-${type}`}
            id={`${id}-${type === 'source' ? 's' : 't'}`}
            type={type}
            position={position}
            style={{ opacity: 0, ...(offset ? { left: offset } : {}) }}
            isConnectable={false}
          />
        )),
      )}
      <div className="flex items-center gap-2">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
        <span className="font-serif text-lg font-semibold">{data.label}</span>
        {state.status === 'done' && <CircleCheck className="ml-auto size-4 text-accepted" aria-label="selesai" />}
        {state.status === 'rejected' && <CircleX className="ml-auto size-4 text-rejected" aria-label="menolak" />}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{data.caption}</p>
      <p className="mt-2 min-h-5 text-xs">
        {state.lastStep ? (
          <>
            <span className="font-medium">{stepLabel(state.lastStep)}</span>
            {state.durationMs !== undefined && <span className="text-muted-foreground"> · {formatMs(state.durationMs)}</span>}
          </>
        ) : (
          <span className="text-muted-foreground">Menunggu</span>
        )}
      </p>
      {state.gasUsed !== undefined && <GasLine gas={state.gasUsed} />}
      {state.reason && (
        <p className="mt-1 text-xs text-rejected">
          <code className="font-mono font-semibold">{state.reason}</code>
          <span className="block">{explainReason(state.reason)}</span>
        </p>
      )}
    </div>
  );
}
