import type { Brand, Result } from '../../shared/index.js';
import { err, ok } from '../../shared/index.js';

/**
 * GPA multiplied by 100 (3.75 -> 375). Stored as an integer so it maps directly
 * to a field element in the circuit.
 */
export type Gpa = Brand<number, 'Gpa'>;

export const GPA_MIN = 0;
export const GPA_MAX = 400;

export const toGpa = (scaled: number): Result<Gpa, 'GPA_OUT_OF_RANGE'> =>
  Number.isInteger(scaled) && scaled >= GPA_MIN && scaled <= GPA_MAX
    ? ok(scaled as Gpa)
    : err('GPA_OUT_OF_RANGE');
