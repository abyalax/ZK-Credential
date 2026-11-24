import type { Container } from '@/application';
import { createHttpHolder, createHttpIssuer, createHttpRuns, createHttpVerifier } from './http/http-gateways';
import { createMockHolder, createMockIssuer, createMockState, createMockVerifier } from './mock/mock-manual-gateways';
import { createMockRunGateway } from './mock/mock-run-gateway';

export type ApiMode = 'mock' | 'http';

export const createContainer = (mode: ApiMode): Container => {
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
