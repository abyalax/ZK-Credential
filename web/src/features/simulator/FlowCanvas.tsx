import { MarkerType, ReactFlow } from '@xyflow/react';
import { useAtomValue } from 'jotai';
import { useMemo } from 'react';
import { GRAPH_EDGES, GRAPH_NODES, type GraphState } from '@/domain';
import { graphAtom } from './model';
import { PayloadEdge, type PayloadFlowEdge } from './PayloadEdge';
import { type RoleFlowNode, RoleNode } from './RoleNode';

const nodeTypes = { role: RoleNode };
const edgeTypes = { payload: PayloadEdge };

/** Handle ids per edge: [source handle, target handle, label side]. Two edges join holder and verifier, one per side. */
const ROUTES = {
  'issuer->holder': ['r-s', 'l-t', 'center'],
  'verifier->holder': ['tl-s', 'bl-t', 'left'],
  'holder->verifier': ['br-s', 'tr-t', 'right'],
  'verifier->contract': ['l-s', 'r-t', 'center'],
} as const;

const useFlowNodes = (graph: GraphState): RoleFlowNode[] =>
  useMemo(
    () =>
      GRAPH_NODES.map(({ id, label, caption, x, y }) => ({
        id,
        type: 'role',
        position: { x, y },
        draggable: false,
        data: { id, label, caption, state: graph.nodes[id] },
      })),
    [graph.nodes],
  );

const useFlowEdges = (graph: GraphState): PayloadFlowEdge[] =>
  useMemo(
    () =>
      GRAPH_EDGES.map(({ id, source, target, label }) => {
        const [sourceHandle, targetHandle, side] = ROUTES[id];
        const state = graph.edges[id];
        return {
          id,
          source,
          target,
          sourceHandle,
          targetHandle,
          type: 'payload',
          markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
          data: { label, status: state.status, payload: state.payload, side },
        };
      }),
    [graph.edges],
  );

export function FlowCanvas() {
  const graph = useAtomValue(graphAtom);
  const nodes = useFlowNodes(graph);
  const edges = useFlowEdges(graph);

  return (
    <section
      className="h-[560px] overflow-hidden rounded-lg border bg-card"
      aria-label="Alur Issuer, Holder, Verifier, dan Contract"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        panOnDrag={false}
        preventScrolling={false}
        minZoom={0.4}
      />
    </section>
  );
}
