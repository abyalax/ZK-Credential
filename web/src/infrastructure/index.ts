import type { Container } from '@/application';
import type { Recording } from '@/domain';
import { createHttpHolder, createHttpIssuer, createHttpRuns, createHttpVerifier } from './http/http-gateways';
import { createMockHolder, createMockIssuer, createMockState, createMockVerifier } from './mock/mock-manual-gateways';
import { createMockRunGateway } from './mock/mock-run-gateway';
import { loadRecordings } from './recorded/load-recordings';
import { createReplayRuns } from './recorded/replay-runs';

export type ApiMode = 'mock' | 'http' | 'replay';

export const createContainer = (mode: 'mock' | 'http'): Container => {
  if (mode === 'http') {
    return {
      mode,
      issuer: createHttpIssuer(),
      holder: createHttpHolder(),
      verifier: createHttpVerifier(),
      runs: createHttpRuns(),
    };
  }
  const state = createMockState();
  return {
    mode,
    issuer: createMockIssuer(state),
    holder: createMockHolder(state),
    verifier: createMockVerifier(state),
    runs: createMockRunGateway(),
  };
};

const replayOnly = (): Promise<never> => Promise.reject(new Error('REPLAY_MODE'));

/** Replay serves the simulator only; the role pages need a live server, so their gateways refuse. */
export const createReplayContainer = (recordings: readonly Recording[]): Container => ({
  mode: 'replay',
  recordedAt:
    recordings
      .map((recording) => recording.recordedAt)
      .sort()
      .at(-1) ?? '',
  issuer: { profile: replayOnly, issued: replayOnly, issue: replayOnly },
  holder: { credentials: replayOnly, createProof: replayOnly },
  verifier: { challenges: replayOnly, issueChallenge: replayOnly, verify: replayOnly },
  runs: createReplayRuns(recordings),
});

/** Builds the container for `mode`; only `replay` does I/O (it fetches the recordings under `/recordings`). */
export const bootstrapContainer = async (mode: ApiMode): Promise<Container> =>
  mode === 'replay' ? createReplayContainer(await loadRecordings()) : createContainer(mode);
