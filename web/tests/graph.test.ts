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

  it('keeps gas on the contract node and out of the edge payload', () => {
    const graph = replay([
      event({ node: 'contract', step: 'proof.verified', status: 'completed', durationMs: 40, data: { gasUsed: 251_374 } }, 0),
      event({ node: 'verifier', step: 'challenge.consumed', status: 'completed' }, 1),
    ]);
    expect(graph.nodes.contract.gasUsed).toBe(251_374);
    expect(graph.edges['verifier->contract'].payload).toEqual([]);
    expect(graph.nodes.verifier.gasUsed).toBeUndefined();
  });

  it('shows no gas when the proof is rejected or the event carries none', () => {
    const rejected = replay([event({ node: 'contract', step: 'proof.verified', status: 'rejected', reason: 'PROOF_INVALID' })]);
    expect(rejected.nodes.contract.gasUsed).toBeUndefined();
    const plain = replay([event({ node: 'contract', step: 'proof.verified', status: 'completed' })]);
    expect(plain.nodes.contract.gasUsed).toBeUndefined();
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
