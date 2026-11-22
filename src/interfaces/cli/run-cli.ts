import { CliError, parseArgs } from './args.js';
import { type Command, protocolCommands } from './commands/index.js';
import type { CliContext, CliIo } from './context.js';

export type { CliContext, CliIo } from './context.js';

const help: Command = {
  name: 'help',
  description: 'Show available commands',
  run: async (_args, _context, io) => {
    io.stdout(helpText());
    return 0;
  },
};

const commands: readonly Command[] = [help, ...protocolCommands];

const helpText = (): string =>
  [
    'zk-credential CLI',
    '',
    'Usage: pnpm cli <command> [--flag value]',
    '',
    'Commands:',
    ...commands.map((command) => `  ${command.name.padEnd(17)}${command.description}`),
    '',
    'Exit codes: 0 success, 1 error, 2 proof rejected by `verify`.',
    '',
  ].join('\n');

const reportError = (error: unknown, io: CliIo): number => {
  io.stderr(error instanceof CliError ? error.message : `Unexpected error: ${String(error)}`);
  return 1;
};

/** Imperative shell entry: maps argv to a command and returns a process exit code. */
export const runCli = async (argv: readonly string[], io: CliIo, context?: CliContext): Promise<number> => {
  const [name = 'help', ...rest] = argv;
  const command = commands.find((candidate) => candidate.name === name);
  if (!command) {
    io.stderr(`Unknown command: ${name}\n\n${helpText()}`);
    return 1;
  }
  if (command === help) return help.run(parseArgs(rest), unusedContext, io);
  if (!context) return reportError(new CliError('CLI context is not configured'), io);
  try {
    return await command.run(parseArgs(rest), context, io);
  } catch (error) {
    return reportError(error, io);
  }
};

/** `help` never touches the context; this keeps its signature uniform without a real one. */
const unusedContext = undefined as unknown as CliContext;
