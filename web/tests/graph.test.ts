import { describe, expect, it } from 'vitest';
import { applyEvent, initialGraph, type RunEvent, rejectingNode, replay } from '@/domain';

const event = (partial: Partial<RunEvent> & Pick<RunEvent, 'node' | 'step' | 'status'>, seq = 0): RunEvent => ({
  runId: 'run-1',
  seq,
  at: 0,
  ...partial,
});

describe('graph reducer', () => {
  it('starts idle', () => {
    const graph = initialGraph();
    expect(Object.values(graph.nodes).every((node) => node.status === 'idle')).toBe(true);
    expect(Object.values(graph.edges).every((edge) => edge.status === 'idle')).toBe(true);
  });

  it('moves the node and the edge that the step belongs to', () => {
    const next = applyEvent(
      initialGraph(),
      event({ node: 'holder', step: 'presentation.sent', status: 'completed', data: { gpaThreshold: 350 } }),
    );
    expect(next.nodes.holder.status).toBe('done');
    expect(next.edges['holder->verifier']).toEqual({ status: 'done', payload: [{ key: 'gpaThreshold', value: '350' }] });
  });

  it('keeps the duration of an earlier event when a later one has none', () => {
    const graph = replay([
      event({ node: 'holder', step: 'proof.generated', status: 'completed', durationMs: 800 }, 0),
      event({ node: 'holder', step: 'presentation.sent', status: 'completed' }, 1),
    ]);
    expect(graph.nodes.holder.durationMs).toBe(800);
  });

  it('marks the rejecting node red and the edge blocked, with the reason', () => {
    const graph = replay([event({ node: 'contract', step: 'proof.verified', status: 'rejected', reason: 'PROOF_INVALID' })]);
    expect(graph.nodes.contract).toMatchObject({ status: 'rejected', reason: 'PROOF_INVALID' });
    expect(graph.edges['verifier->contract'].status).toBe('blocked');
  });

  it('does not mutate the previous state', () => {
    const before = initialGraph();
    applyEvent(before, event({ node: 'issuer', step: 'credential.issued', status: 'completed' }));
    expect(before.nodes.issuer.status).toBe('idle');
  });
});

describe('rejectingNode', () => {
  it.each([
    ['PROVE_FAILED', 'holder'],
    ['PROOF_INVALID', 'contract'],
    ['ISSUER_NOT_REGISTERED', 'contract'],
    ['CHALLENGE_EXPIRED', 'verifier'],
    ['THRESHOLD_BELOW_REQUIRED', 'verifier'],
  ])('%s is rejected at %s', (reason, node) => expect(rejectingNode(reason)).toBe(node));
});
