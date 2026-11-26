import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createSseParser,
  mergeIndex,
  type Recording,
  type RecordingIndex,
  recordAll,
  recordScenario,
  type SseMessage,
  writeRecordings,
} from '../../../scripts/record-simulation-lib.js';
import { privateDataKeys } from '../../../src/application/index.js';
import { type RunningServer, startHttpServer } from '../../../src/interfaces/http/index.js';
import { createSimulationServices } from '../../support/simulation-services.js';

const GAS = 251_374;
let server: RunningServer;
let outDir: string;

beforeEach(async () => {
  const { services } = createSimulationServices({}, { verifyCredentialGas: GAS });
  server = await startHttpServer({ services }, { host: '127.0.0.1', port: 0 });
  outDir = mkdtempSync(join(tmpdir(), 'recordings-'));
});

afterEach(async () => {
  await server.close();
  rmSync(outDir, { recursive: true, force: true });
});

const record = (scenarioId: string): Promise<readonly Recording[]> =>
  recordAll({ baseUrl: server.url, scenarioIds: [scenarioId], configuration: 'B4' });

describe('recording a live run', () => {
  it('captures a normal flow: ordered public events, the gas reference and the closing summary', async () => {
    const [recording] = await record('valid-accepted');
    expect(recording?.version).toBe(1);
    expect(recording?.configuration).toBe('B4');
    expect(recording?.scenario.id).toBe('valid-accepted');
    expect(recording?.summary.outcome).toEqual({ accepted: true, stage: 'verify', reason: 'ACCEPTED' });

    const events = recording?.events ?? [];
    expect(events.map((event) => event.seq)).toEqual(events.map((_, index) => index));
    expect(events.every((event) => event.runId === recording?.summary.runId)).toBe(true);
    expect(events.every((event) => privateDataKeys(event.data).length === 0)).toBe(true);
    const verified = events.find((event) => event.step === 'proof.verified' && event.status === 'completed');
    expect(verified?.data).toEqual({ gasUsed: GAS });
  });

  it('captures an attack that ends in a rejection, with its reason', async () => {
    const [recording] = await record('replay-same-proof');
    expect(recording?.summary.outcome.reason).toBe('CHALLENGE_ALREADY_USED');
    expect(recording?.events.at(-1)).toMatchObject({ node: 'verifier', step: 'preconditions.checked', status: 'rejected' });
  });

  it('records two scenarios in sequence despite the one-run-at-a-time rule', async () => {
    const recordings = await recordAll({
      baseUrl: server.url,
      scenarioIds: ['valid-accepted', 'replay-same-proof'],
      configuration: 'B4',
    });
    expect(recordings.map((recording) => recording.scenario.id)).toEqual(['valid-accepted', 'replay-same-proof']);
  });

  it('refuses an unknown scenario and one that cannot run on the chosen configuration', async () => {
    await expect(record('no-such-scenario')).rejects.toThrow(/Unknown scenario "no-such-scenario"/);
    await expect(recordAll({ baseUrl: server.url, scenarioIds: ['valid-accepted'], configuration: 'B1' })).rejects.toThrow(
      /cannot run on B1/,
    );
    await expect(record('credential-tampered')).rejects.toThrow(/cannot run on B4/);
  });
});

describe('recording a broken or leaky stream', () => {
  it('fails with RUN_INTERRUPTED when the stream ends before run.completed', async () => {
    const [scenario] = (await record('valid-accepted')).map((recording) => recording.scenario);
    if (!scenario) throw new Error('missing scenario');
    const encoder = new TextEncoder();
    const fetchFn: typeof fetch = async (input) => {
      if (String(input).endsWith('/api/runs')) return Response.json({ runId: 'r1' }, { status: 202 });
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'data: {"runId":"r1","seq":0,"node":"issuer","step":"credential.issued","status":"completed","at":1}\n\n',
            ),
          );
          controller.enqueue(encoder.encode(': run failed\n\n'));
          controller.close();
        },
      });
      return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
    };
    await expect(recordScenario({ baseUrl: 'http://stub', scenario, configuration: 'B4', fetchFn })).rejects.toThrow(
      /RUN_INTERRUPTED.*run failed/,
    );
  });

  it('refuses to record an event that carries a non-public key', async () => {
    const [scenario] = (await record('valid-accepted')).map((recording) => recording.scenario);
    if (!scenario) throw new Error('missing scenario');
    const leak = JSON.stringify({
      runId: 'r1',
      seq: 0,
      node: 'holder',
      step: 'witness.computed',
      status: 'completed',
      at: 1,
      data: { holderPrivateKey: 'x' },
    });
    const summary = JSON.stringify({
      runId: 'r1',
      configuration: 'B4',
      scenarioId: scenario.id,
      outcome: { accepted: true, stage: 'verify', reason: 'ACCEPTED' },
      totalMs: 1,
    });
    const fetchFn: typeof fetch = async (input) =>
      String(input).endsWith('/api/runs')
        ? Response.json({ runId: 'r1' }, { status: 202 })
        : new Response(`data: ${leak}\n\nevent: run.completed\ndata: ${summary}\n\n`, {
            headers: { 'Content-Type': 'text/event-stream' },
          });
    await expect(recordScenario({ baseUrl: 'http://stub', scenario, configuration: 'B4', fetchFn })).rejects.toThrow(
      /non-public.*holderPrivateKey/,
    );
  });
});

describe('writing recordings', () => {
  it('writes one file per recording and an index, and merges with an existing index', async () => {
    const [first] = await record('valid-accepted');
    const [second] = await record('replay-same-proof');
    if (!(first && second)) throw new Error('missing recordings');

    await writeRecordings(outDir, [first]);
    const index = await writeRecordings(outDir, [second]);

    expect(index.recordings.map((entry) => entry.file)).toEqual(['replay-same-proof.B4.json', 'valid-accepted.B4.json']);
    const onDisk = JSON.parse(readFileSync(join(outDir, 'valid-accepted.B4.json'), 'utf8')) as Recording;
    expect(onDisk.summary.outcome.accepted).toBe(true);
    expect(JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8'))).toEqual(index);
  });

  it('replaces the entry of a scenario that is recorded again', () => {
    const existing: RecordingIndex = {
      version: 1,
      recordings: [
        { file: 'a.B4.json', scenarioId: 'a', configuration: 'B4', recordedAt: 'old' },
        { file: 'b.B4.json', scenarioId: 'b', configuration: 'B4', recordedAt: 'old' },
      ],
    };
    const merged = mergeIndex(existing, [{ file: 'a.B4.json', scenarioId: 'a', configuration: 'B4', recordedAt: 'new' }]);
    expect(merged.recordings).toEqual([
      { file: 'a.B4.json', scenarioId: 'a', configuration: 'B4', recordedAt: 'new' },
      { file: 'b.B4.json', scenarioId: 'b', configuration: 'B4', recordedAt: 'old' },
    ]);
  });
});

describe('SSE parser', () => {
  const parse = (chunks: readonly string[]): SseMessage[] => {
    const out: SseMessage[] = [];
    const feed = createSseParser((message) => out.push(message));
    for (const chunk of chunks) feed(chunk);
    return out;
  };

  it('reads data, named events and comments', () => {
    expect(parse(['data: {"a":1}\n\nevent: run.completed\ndata: {"b":2}\n\n: run failed\n\n'])).toEqual([
      { event: 'message', data: '{"a":1}' },
      { event: 'run.completed', data: '{"b":2}' },
      { event: 'comment', data: 'run failed' },
    ]);
  });

  it('is not confused by chunks that split a message anywhere', () => {
    const text = 'data: {"seq":0}\n\nevent: run.completed\ndata: {"ok":true}\n\n';
    const whole = parse([text]);
    for (let cut = 1; cut < text.length; cut += 1) expect(parse([text.slice(0, cut), text.slice(cut)])).toEqual(whole);
  });

  it('holds back an unfinished message until it is complete', () => {
    expect(parse(['data: {"seq":0}\n'])).toEqual([]);
  });
});
