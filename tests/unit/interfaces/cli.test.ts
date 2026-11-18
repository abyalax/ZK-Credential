import { describe, expect, it } from 'vitest';
import { runCli } from '../../../src/interfaces/cli/index.js';

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
  it('prints help by default', () => {
    const { out, io } = capture();
    expect(runCli([], io)).toBe(0);
    expect(out.join('')).toContain('Usage: pnpm cli');
  });

  it('fails on an unknown command', () => {
    const { errors, io } = capture();
    expect(runCli(['nope'], io)).toBe(1);
    expect(errors.join('')).toContain('Unknown command: nope');
  });
});
