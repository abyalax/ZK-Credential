import type { NodeId, RunEvent, StepStatus } from './run-event';

export type EdgeId = 'issuer->holder' | 'verifier->holder' | 'holder->verifier' | 'verifier->contract';
export type NodeStatus = 'idle' | 'active' | 'done' | 'rejected';
export type EdgeStatus = 'idle' | 'flowing' | 'done' | 'blocked';

export interface GraphNodeState {
  readonly status: NodeStatus;
  readonly lastStep: string | undefined;
  readonly durationMs: number | undefined;
  readonly reason: string | undefined;
}

export interface PayloadChip {
  readonly key: string;
  readonly value: string;
}

export interface GraphEdgeState {
  readonly status: EdgeStatus;
  readonly payload: readonly PayloadChip[];
}

export interface GraphState {
  readonly nodes: Readonly<Record<NodeId, GraphNodeState>>;
  readonly edges: Readonly<Record<EdgeId, GraphEdgeState>>;
}

/** Fixed topology: only the execution is dynamic. */
export const GRAPH_NODES: readonly { id: NodeId; label: string; caption: string; x: number; y: number }[] = [
  { id: 'issuer', label: 'Issuer', caption: 'Menerbitkan dan menandatangani', x: 0, y: 0 },
  { id: 'holder', label: 'Holder', caption: 'Menyimpan dan membuat proof', x: 380, y: 0 },
  { id: 'verifier', label: 'Verifier', caption: 'Meminta dan memeriksa proof', x: 380, y: 260 },
  { id: 'contract', label: 'Contract', caption: 'CredentialVerifier dan IssuerRegistry', x: 0, y: 260 },
];

export const GRAPH_EDGES: readonly { id: EdgeId; source: NodeId; target: NodeId; label: string }[] = [
  { id: 'issuer->holder', source: 'issuer', target: 'holder', label: 'kredensial bertanda tangan' },
  { id: 'verifier->holder', source: 'verifier', target: 'holder', label: 'challenge' },
  { id: 'holder->verifier', source: 'holder', target: 'verifier', label: 'presentasi' },
  { id: 'verifier->contract', source: 'verifier', target: 'contract', label: 'proof + public signals' },
];

const STEP_EDGE: Readonly<Record<string, EdgeId>> = {
  'credential.issued': 'issuer->holder',
  'challenge.issued': 'verifier->holder',
  'presentation.sent': 'holder->verifier',
  'issuer.checked': 'verifier->contract',
};

const idleNode: GraphNodeState = { status: 'idle', lastStep: undefined, durationMs: undefined, reason: undefined };
const idleEdge: GraphEdgeState = { status: 'idle', payload: [] };

export const initialGraph = (): GraphState => ({
  nodes: { issuer: idleNode, holder: idleNode, verifier: idleNode, contract: idleNode },
  edges: {
    'issuer->holder': idleEdge,
    'verifier->holder': idleEdge,
    'holder->verifier': idleEdge,
    'verifier->contract': idleEdge,
  },
});

const NODE_STATUS: Readonly<Record<StepStatus, NodeStatus>> = { started: 'active', completed: 'done', rejected: 'rejected' };
const EDGE_STATUS: Readonly<Record<StepStatus, EdgeStatus>> = { started: 'flowing', completed: 'done', rejected: 'blocked' };

const edgeFor = (event: RunEvent): EdgeId | undefined =>
  event.step === 'proof.verified' && event.node === 'contract' ? 'verifier->contract' : STEP_EDGE[event.step];

const chips = (event: RunEvent): PayloadChip[] =>
  Object.entries(event.data ?? {}).map(([key, value]) => ({ key, value: String(value) }));

/** Pure reducer: one event moves one node, and the edge the step belongs to, if any. */
export const applyEvent = (state: GraphState, event: RunEvent): GraphState => {
  const node: GraphNodeState = {
    status: NODE_STATUS[event.status],
    lastStep: event.step,
    durationMs: event.durationMs ?? state.nodes[event.node].durationMs,
    reason: event.reason,
  };
  const edgeId = edgeFor(event);
  const edges = edgeId
    ? { ...state.edges, [edgeId]: { status: EDGE_STATUS[event.status], payload: mergeChips(state.edges[edgeId], event) } }
    : state.edges;
  return { nodes: { ...state.nodes, [event.node]: node }, edges };
};

const mergeChips = (edge: GraphEdgeState, event: RunEvent): readonly PayloadChip[] => {
  const incoming = chips(event);
  const kept = edge.payload.filter((chip) => !incoming.some((next) => next.key === chip.key));
  return [...kept, ...incoming];
};

export const replay = (events: readonly RunEvent[]): GraphState => events.reduce((accumulator, event) => applyEvent(accumulator, event), initialGraph());
