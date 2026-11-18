import { randomBytes } from 'node:crypto';
import type { Randomness } from '../../application/index.js';

export const cryptoRandomness: Randomness = {
  hex: (bytes) => randomBytes(bytes).toString('hex'),
};
