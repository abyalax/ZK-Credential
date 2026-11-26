import { describe, expect, it } from 'vitest';
import { formatGas, formatGpa, parseGpa } from '@/shared';

describe('format', () => {
  it('groups gas digits with a dot, as in Indonesian numbers', () => {
    expect(formatGas(251_374)).toBe('251.374');
    expect(formatGas(900)).toBe('900');
  });

  it('keeps GPA as an integer scaled by 100', () => {
    expect(parseGpa('3,75')).toBe(375);
    expect(formatGpa(375)).toBe('3.75');
  });
});
