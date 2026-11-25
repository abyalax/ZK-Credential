import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunSummary } from '../../../src/application/index.js';
import { createApp, type HttpServices } from '../../../src/interfaces/http/index.js';
import type { buildOpenApiDocument } from '../../../src/interfaces/http/openapi/document.js';
import { createDemoServices } from '../../support/demo-services.js';

interface Harness {
  readonly base: string;
  readonly close: () => Promise<void>;
  readonly idle: () => Promise<void>;
}

const quietLogger = { error: () => undefined };

const start = async (services: HttpServices): Promise<Harness> => {
  const { app, runs } = createApp({ services, logger: quietLogger });
  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    idle: () => runs.idle(),
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
};

let harness: Harness;
beforeEach(async () => {
  harness = await start(createDemoServices().services);
});
afterEach(async () => {
  await harness.close();
});

const call = async <T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> => {
  const response = await fetch(`${harness.base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : undefined) as T };
};

const student = { studentNumber: '2210001', fullName: 'Ayu Lestari', degree: 'S.Kom.', graduationDate: '2026-08-20', gpa: 375 };

type Envelope<T, E = string> = { ok: true; value: T } | { ok: false; error: E };
interface Credential {
  id: string;
  gpa: number;
  holderPublicKey: string;
}
interface ProofBody {
  payload: string;
  publicSignals: Record<string, unknown>;
  sizeBytes: number;
  durationMs: number;
}

const issueOne = async (): Promise<Credential> => {
  const issued = await call<Envelope<Credential>>('POST', '/api/issuer/credentials', student);
  if (!issued.body.ok) throw new Error('issuance failed');
  return issued.body.value;
};

const prove = async (credentialId: string, challenge: string, threshold = 300): Promise<ProofBody> => {
  const proof = await call<Envelope<ProofBody>>('POST', '/api/holder/proofs', {
    credentialId,
    challenge,
    verifierId: 'verifier-a',
    threshold,
  });
  if (!proof.body.ok) throw new Error(`proof failed: ${proof.body.error}`);
  return proof.body.value;
};

const challengeFor = async (verifierId = 'verifier-a', ttlMs = 60_000): Promise<string> =>
  (await call<{ value: string }>('POST', '/api/verifier/challenges', { verifierId, ttlMs })).body.value;

describe('issuer endpoints', () => {
  it('reports the configured issuer and its registration', async () => {
    const response = await call<Record<string, unknown>>('GET', '/api/issuer');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 'issuer-1', name: 'Test University', publicKey: '1:2', registered: true });
  });

  it('issues a credential in a Result envelope and never returns the signature', async () => {
    const response = await call<Envelope<Credential>>('POST', '/api/issuer/credentials', student);
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    const text = JSON.stringify(response.body);
    expect(text).not.toContain('signature');
    expect(text).not.toContain('fake-signature');
    expect((await call<Credential[]>('GET', '/api/issuer/credentials')).body).toHaveLength(1);
  });

  it('answers a domain validation error with HTTP 200 and ok false', async () => {
    const response = await call('POST', '/api/issuer/credentials', { ...student, gpa: 500 });
    expect(response).toEqual({ status: 200, body: { ok: false, error: 'GPA_OUT_OF_RANGE' } });
    const empty = await call('POST', '/api/issuer/credentials', { ...student, fullName: '  ' });
    expect(empty).toEqual({ status: 200, body: { ok: false, error: 'REQUIRED_FIELD_EMPTY' } });
  });

  it('answers a broken request with 4xx and an error code', async () => {
    expect((await call('POST', '/api/issuer/credentials', { ...student, gpa: '3.75' })).status).toBe(400);
    expect((await call('POST', '/api/issuer/credentials', [])).body).toMatchObject({ error: 'INVALID_REQUEST' });
    expect(await call('POST', '/api/issuer/credentials', '{not json')).toEqual({ status: 400, body: { error: 'INVALID_JSON' } });
  });
});

describe('holder endpoints', () => {
  it('lists the wallet and builds a proof with size and timing', async () => {
    const credential = await issueOne();
    const wallet = await call<Credential[]>('GET', '/api/holder/credentials');
    expect(wallet.body.map((item) => item.id)).toEqual([credential.id]);

    const proof = await prove(credential.id, await challengeFor());
    expect(proof.sizeBytes).toBe(Buffer.byteLength(proof.payload));
    expect(proof.publicSignals).toMatchObject({ gpaThreshold: 300, verifierId: 'verifier-a' });
    expect(proof.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(proof)).not.toContain('424242');
  });

  it('reports use-case errors as normal results', async () => {
    const credential = await issueOne();
    const challenge = await challengeFor();
    const missing = await call('POST', '/api/holder/proofs', {
      credentialId: 'nope',
      challenge,
      verifierId: 'verifier-a',
      threshold: 300,
    });
    expect(missing).toEqual({ status: 200, body: { ok: false, error: 'CREDENTIAL_NOT_FOUND' } });
    const above = await call('POST', '/api/holder/proofs', {
      credentialId: credential.id,
      challenge,
      verifierId: 'verifier-a',
      threshold: 400,
    });
    expect(above).toEqual({ status: 200, body: { ok: false, error: 'ATTRIBUTE_BELOW_THRESHOLD' } });
  });

  it('rejects a challenge that is not in canonical form before it reaches the prover', async () => {
    const credential = await issueOne();
    const response = await call('POST', '/api/holder/proofs', {
      credentialId: credential.id,
      challenge: 'ABC',
      verifierId: 'verifier-a',
      threshold: 300,
    });
    expect(response.status).toBe(400);
  });
});

describe('verifier endpoints', () => {
  it('issues a challenge and lists it newest first with its status', async () => {
    const first = await challengeFor('verifier-a');
    const second = await challengeFor('verifier-b');
    const listed = await call<{ value: string; status: string }[]>('GET', '/api/verifier/challenges');
    expect(listed.body.map((item) => item.value).sort()).toEqual([first, second].sort());
    expect(listed.body.every((item) => item.status === 'issued')).toBe(true);
    expect(first).toMatch(/^[0-9a-f]{62}$/);
  });

  it('accepts a valid proof once, then rejects the replay with HTTP 200', async () => {
    const credential = await issueOne();
    const challenge = await challengeFor();
    const proof = await prove(credential.id, challenge);
    const body = { proof, verifierId: 'verifier-a', requiredThreshold: 300 };

    const first = await call<Record<string, unknown>>('POST', '/api/verifier/verifications', body);
    expect(first).toMatchObject({ status: 200, body: { accepted: true, stage: 'verify', reason: 'ACCEPTED' } });
    const replay = await call('POST', '/api/verifier/verifications', body);
    expect(replay).toMatchObject({ status: 200, body: { accepted: false, reason: 'CHALLENGE_ALREADY_USED' } });

    const listed = await call<{ status: string }[]>('GET', '/api/verifier/challenges');
    expect(listed.body[0]?.status).toBe('consumed');
  });

  it('applies the verifier policy, not what the holder claims', async () => {
    const credential = await issueOne();
    const proof = await prove(credential.id, await challengeFor(), 200);
    const weak = await call('POST', '/api/verifier/verifications', { proof, verifierId: 'verifier-a', requiredThreshold: 300 });
    expect(weak.body).toMatchObject({ accepted: false, reason: 'THRESHOLD_BELOW_REQUIRED' });
    const wrongVerifier = await call('POST', '/api/verifier/verifications', {
      proof,
      verifierId: 'verifier-b',
      requiredThreshold: 100,
    });
    expect(wrongVerifier.body).toMatchObject({ accepted: false, reason: 'CHALLENGE_VERIFIER_MISMATCH' });
  });

  it('rejects a proof with a tampered payload as PROOF_INVALID', async () => {
    const credential = await issueOne();
    const proof = await prove(credential.id, await challengeFor());
    const forged = await call('POST', '/api/verifier/verifications', {
      proof: { ...proof, payload: 'not-json' },
      verifierId: 'verifier-a',
      requiredThreshold: 300,
    });
    expect(forged.body).toMatchObject({ accepted: false, stage: 'verify', reason: 'PROOF_INVALID' });
  });

  it('validates challenge and verification requests', async () => {
    expect((await call('POST', '/api/verifier/challenges', { verifierId: 'v', ttlMs: 0 })).status).toBe(400);
    expect((await call('POST', '/api/verifier/challenges', { verifierId: '', ttlMs: 1000 })).status).toBe(400);
    expect((await call('POST', '/api/verifier/verifications', { verifierId: 'v' })).status).toBe(400);
  });
});

interface Sse {
  events: Record<string, unknown>[];
  summary: RunSummary | undefined;
}

const readStream = async (path: string): Promise<Sse> => {
  const response = await fetch(`${harness.base}${path}`);
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  const text = await response.text();
  const result: Sse = { events: [], summary: undefined };
  for (const block of text.split('\n\n').filter(Boolean)) {
    const data = block
      .split('\n')
      .find((line) => line.startsWith('data: '))
      ?.slice(6);
    if (!data) continue;
    if (block.startsWith('event: run.completed')) result.summary = JSON.parse(data) as RunSummary;
    else result.events.push(JSON.parse(data) as Record<string, unknown>);
  }
  return result;
};

describe('scenarios and runs', () => {
  it('serves the catalog', async () => {
    const response = await call<{ id: string; applicableConfigurations: string[] }[]>('GET', '/api/scenarios');
    expect(response.body).toHaveLength(26);
    expect(response.body.find((scenario) => scenario.id === 'valid-accepted')?.applicableConfigurations).toEqual(['B4']);
  });

  it('streams a run as SSE and ends with run.completed', async () => {
    const started = await call<{ runId: string }>('POST', '/api/runs', { configuration: 'B4', scenarioId: 'replay-same-proof' });
    expect(started.status).toBe(202);
    const stream = await readStream(`/api/runs/${started.body.runId}/events`);
    expect(stream.events.map((event) => event.seq)).toEqual(stream.events.map((_event, index) => index));
    expect(stream.summary?.outcome).toEqual({ accepted: false, stage: 'verify', reason: 'CHALLENGE_ALREADY_USED' });
  });

  it('replays a finished run from seq 0 to a late client', async () => {
    const { body } = await call<{ runId: string }>('POST', '/api/runs', { configuration: 'B4', scenarioId: 'valid-accepted' });
    const early = await readStream(`/api/runs/${body.runId}/events`);
    const late = await readStream(`/api/runs/${body.runId}/events`);
    expect(late).toEqual(early);
    expect(late.events[0]?.seq).toBe(0);
  });

  it('refuses unknown scenarios, unsupported configurations and bad bodies with 400', async () => {
    expect(await call('POST', '/api/runs', { configuration: 'B4', scenarioId: 'nope' })).toEqual({
      status: 400,
      body: { error: 'SCENARIO_UNKNOWN' },
    });
    expect(await call('POST', '/api/runs', { configuration: 'SD', scenarioId: 'valid-accepted' })).toEqual({
      status: 400,
      body: { error: 'SCENARIO_NOT_APPLICABLE' },
    });
    expect((await call('POST', '/api/runs', { configuration: 'Z9', scenarioId: 'valid-accepted' })).status).toBe(400);
    expect((await call('POST', '/api/runs', {})).status).toBe(400);
  });

  it('answers an unknown run id with 404 RUN_UNKNOWN', async () => {
    expect(await call('GET', '/api/runs/r999/events')).toEqual({ status: 404, body: { error: 'RUN_UNKNOWN' } });
  });
});

describe('one run at a time', () => {
  it('rejects a second run with 409 while the first is still going, then accepts again', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { services } = createDemoServices();
    const slow = await start({
      ...services,
      runScenario: async (input) => {
        await gate;
        return services.runScenario(input);
      },
    });
    const post = () =>
      fetch(`${slow.base}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configuration: 'B4', scenarioId: 'valid-accepted' }),
      });
    try {
      expect((await post()).status).toBe(202);
      const second = await post();
      expect(second.status).toBe(409);
      expect(await second.json()).toEqual({ error: 'RUN_IN_PROGRESS' });
      release();
      await slow.idle();
      expect((await post()).status).toBe(202);
    } finally {
      release();
      await slow.idle();
      await slow.close();
    }
  });

  it('closes the stream without run.completed when a run crashes', async () => {
    const { services } = createDemoServices();
    const crashing = await start({
      ...services,
      runScenario: async () => {
        throw new Error('chain unreachable');
      },
    });
    try {
      const started = await fetch(`${crashing.base}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configuration: 'B4', scenarioId: 'valid-accepted' }),
      });
      const { runId } = (await started.json()) as { runId: string };
      await crashing.idle();
      const stream = await (await fetch(`${crashing.base}/api/runs/${runId}/events`)).text();
      expect(stream).not.toContain('run.completed');
      expect(stream).not.toContain('chain unreachable');
    } finally {
      await crashing.close();
    }
  });
});

describe('error handling and access', () => {
  it('maps unexpected failures to 500 without leaking the message', async () => {
    const { services } = createDemoServices();
    const broken = await start({
      ...services,
      listCredentials: async () => {
        throw new Error('secret path /home/x');
      },
    });
    try {
      const response = await fetch(`${broken.base}/api/issuer/credentials`);
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'INTERNAL_ERROR' });
    } finally {
      await broken.close();
    }
  });

  it('answers an unknown path with 404 NOT_FOUND', async () => {
    expect(await call('GET', '/api/nothing')).toEqual({ status: 404, body: { error: 'NOT_FOUND' } });
  });

  it('answers only local hostnames', async () => {
    const hostHeader = (host: string): Promise<number> =>
      new Promise((resolve, reject) => {
        const { port } = new URL(harness.base);
        const req = httpRequest({ host: '127.0.0.1', port, path: '/api/issuer', headers: { host } }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.on('error', reject);
        req.end();
      });
    expect(await hostHeader('evil.example')).toBe(403);
    expect(await hostHeader('localhost:5173')).toBe(200);
  });
});

describe('API docs', () => {
  it('serves an OpenAPI document that describes real routes only', async () => {
    const { status, body } = await call<ReturnType<typeof buildOpenApiDocument>>('GET', '/api/openapi.json');
    expect(status).toBe(200);
    expect(body.openapi).toBe('3.1.0');
    for (const [path, item] of Object.entries(body.paths)) {
      for (const method of Object.keys(item)) {
        const url = path.replace('{id}', 'r0');
        const response = await call<{ error?: string }>(method.toUpperCase(), url, method === 'post' ? {} : undefined);
        expect(response.body?.error, `${method.toUpperCase()} ${path}`).not.toBe('NOT_FOUND');
      }
    }
  });

  it('renders Scalar from local assets, with no CDN', async () => {
    const page = await fetch(`${harness.base}/api/docs`);
    const html = await page.text();
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('/api/docs/assets/standalone.js');
    expect(html).toContain('/api/openapi.json');
    expect(html).not.toContain('cdn.jsdelivr.net');
    const script = await fetch(`${harness.base}/api/docs/assets/standalone.js`);
    expect(script.status).toBe(200);
    await script.body?.cancel();
  });
});
