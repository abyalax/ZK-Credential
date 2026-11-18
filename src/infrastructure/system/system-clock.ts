import type { Clock } from '../../application/index.js';

export const systemClock: Clock = { now: () => Date.now() };
