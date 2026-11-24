import { BaseEdge, type Edge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from '@xyflow/react';
import type { EdgeStatus, PayloadChip } from '@/domain';
import { shorten } from '@/shared';
import { cn } from '@/ui/lib/cn';

export type PayloadEdgeData = {
  label: string;
  status: EdgeStatus;
  payload: readonly PayloadChip[];
  side: 'left' | 'right' | 'center';
} & Record<string, unknown>;
export type PayloadFlowEdge = Edge<PayloadEdgeData, 'payload'>;

const STROKE: Record<EdgeStatus, string> = {
  idle: 'var(--border)',
  flowing: 'var(--running)',
  done: 'var(--accepted)',
  blocked: 'var(--rejected)',
};

const ANCHOR = {
  left: 'translate(calc(-100% - 10px), -50%)',
  right: 'translate(10px, -50%)',
  center: 'translate(-50%, -50%)',
} as const;

export function PayloadEdge(props: EdgeProps<PayloadFlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  if (!data) return null;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={cn(data.status === 'flowing' && 'edge-flowing')}
        style={{ stroke: STROKE[data.status], strokeWidth: data.status === 'idle' ? 1.5 : 2.5 }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-none absolute grid max-w-44 gap-1 text-xs"
          style={{ transform: `${ANCHOR[data.side]} translate(${labelX}px, ${labelY}px)`, left: 0, top: 0 }}
        >
          <span className={cn('rounded bg-background/90 px-1 font-medium', data.status === 'blocked' && 'text-rejected')}>
            {data.label}
          </span>
          {data.payload.map((chip) => (
            <span key={chip.key} className="truncate rounded border bg-card px-1.5 py-0.5 font-mono text-[11px]">
              {chip.key}: {shorten(chip.value, 12, 4)}
            </span>
          ))}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
