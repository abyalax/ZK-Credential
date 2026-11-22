import { describe, expect, it } from 'vitest';
import { parseArgs, parseGpa, runCli } from '../../../src/interfaces/cli/index.js';
import type { Container } from '../../../src/interfaces/composition/index.js';

const capture = () => {
  const out: string[] = [];
  const errors: string[] = [];
  return {
    out,
    errors,
    io: { stdout: (t: string) => out.push(t), stderr: (t: string) => errors.push(t) },
  };
};

describe('runCli', () => {
  it('prints help by default and lists the protocol commands', async () => {
    const { out, io } = capture();
    expect(await runCli([], io)).toBe(0);
    const text = out.join('');
    expect(text).toContain('Usage: pnpm cli');
    for (const name of ['issue', 'challenge', 'prove', 'verify', 'bench']) expect(text).toContain(name);
  });

  it('fails on an unknown command', async () => {
    const { errors, io } = capture();
    expect(await runCli(['nope'], io)).toBe(1);
    expect(errors.join('')).toContain('Unknown command: nope');
  });

  it('reports a missing flag as a usage error and still closes the container', async () => {
    const { errors, io } = capture();
    let closed = false;
    const context = {
      stateDir: '.',
      openContainer: async () =>
        ({
          close: async () => {
            closed = true;
          },
        }) as unknown as Container,
      runBench: async () => 0,
    };
    expect(await runCli(['challenge'], io, context)).toBe(1);
    expect(errors.join('')).toContain('Missing required flag --verifier-id');
    expect(closed).toBe(true);
  });
});

describe('parseArgs', () => {
  it('supports --key=value, --key value and bare flags', () => {
    const parsed = parseArgs(['--a=1', '--b', '2', '--c', '--d=x=y', 'pos']);
    expect(Object.fromEntries(parsed.flags)).toEqual({ a: '1', b: '2', c: 'true', d: 'x=y' });
    expect(parsed.positional).toEqual(['pos']);
  });
});

describe('parseGpa', () => {
  it('scales decimal GPA text by 100', () => {
    expect(parseGpa('3.75', 'gpa')).toBe(375);
    expect(parseGpa('4', 'gpa')).toBe(400);
    expect(parseGpa('3.5', 'gpa')).toBe(350);
  });

  it('rejects scaled, negative and out-of-range values', () => {
    for (const bad of ['375', '-1', '4.01', '3.756', 'abc', '']) expect(() => parseGpa(bad, 'gpa')).toThrow('--gpa');
  });
});
