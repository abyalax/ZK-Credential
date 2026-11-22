import type { Command } from './types.js';

export const bench: Command = {
  name: 'bench',
  description: 'Run the P6 benchmark harness (passes flags through, e.g. --runs=30 --no-gas B4)',
  run: (args, context) => context.runBench(args.raw),
};
