import type { ParsedArgs } from '../args.js';
import type { CliContext, CliIo } from '../context.js';

export interface Command {
  readonly name: string;
  readonly description: string;
  /** Returns the process exit code. Throw `CliError` for usage mistakes. */
  readonly run: (args: ParsedArgs, context: CliContext, io: CliIo) => Promise<number>;
}
