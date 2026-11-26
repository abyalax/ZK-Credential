import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRecording, parseRecordingIndex, type Recording, replay } from '@/domain';

/**
 * `tests/fixtures/recordings/` was written by the real `pnpm record:simulation` code (scripts/record-simulation-lib.ts)
 * against the in-process Express server with the fake proof engine. It is test data, not a real Groth16
 * run. It guards the format shared by the recorder (root package) and the validator (this package).
 */
const DIR = join(import.meta.dirname, 'fixtures', 'recordings');
const read = (file: string): unknown => JSON.parse(readFileSync(join(DIR, file), 'utf8'));

const load = (file: string): Recording => {
  const parsed = parseRecording(read(file));
  if (!parsed.ok) throw new Error(`${file}: ${parsed.error}`);
  return parsed.value;
};

describe('recordings written by pnpm record:simulation', () => {
  it('has an index this package accepts, listing files that exist and validate', () => {
    const index = parseRecordingIndex(read('index.json'));
    if (!index.ok) throw new Error(index.error);
    expect(index.value.recordings.map((entry) => entry.file)).toEqual(['replay-same-proof.B4.json', 'valid-accepted.B4.json']);
    for (const entry of index.value.recordings) expect(load(entry.file).scenario.id).toBe(entry.scenarioId);
  });

  it('shows the P6 gas on the Contract node after an accepted run, and nowhere else', () => {
    const graph = replay(load('valid-accepted.B4.json').events);
    expect(graph.nodes.contract).toMatchObject({ status: 'done', gasUsed: 251_374 });
    expect(graph.nodes.verifier.status).toBe('done');
    expect(graph.edges['verifier->contract'].payload.some((chip) => chip.key === 'gasUsed')).toBe(false);
  });

  it('replays the rejected attack so the Verifier is the node that turns red', () => {
    const recording = load('replay-same-proof.B4.json');
    const graph = replay(recording.events);
    expect(recording.summary.outcome.reason).toBe('CHALLENGE_ALREADY_USED');
    expect(graph.nodes.verifier).toMatchObject({ status: 'rejected', reason: 'CHALLENGE_ALREADY_USED' });
  });
});
