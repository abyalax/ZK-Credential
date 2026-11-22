import { bench } from './bench.js';
import { challenge, issue, prove, verify } from './protocol.js';
import { keygen, registerIssuer } from './setup.js';
import type { Command } from './types.js';

export type { Command } from './types.js';

/** Order = order in the help text: demo flow first. */
export const protocolCommands: readonly Command[] = [keygen, registerIssuer, issue, challenge, prove, verify, bench];
