export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

interface Command {
  readonly name: string;
  readonly description: string;
  readonly run: (args: readonly string[], io: CliIo) => number;
}

const commands: readonly Command[] = [
  {
    name: 'help',
    description: 'Show available commands',
    run: (_args, io) => {
      io.stdout(helpText());
      return 0;
    },
  },
];

const helpText = (): string =>
  [
    'zk-credential CLI',
    '',
    'Usage: pnpm cli <command>',
    '',
    'Commands:',
    ...commands.map((command) => `  ${command.name.padEnd(10)}${command.description}`),
    '',
  ].join('\n');

/** Imperative shell entry: maps argv to a command and returns a process exit code. */
export const runCli = (argv: readonly string[], io: CliIo): number => {
  const [name = 'help', ...args] = argv;
  const command = commands.find((candidate) => candidate.name === name);
  if (!command) {
    io.stderr(`Unknown command: ${name}\n\n${helpText()}`);
    return 1;
  }
  return command.run(args, io);
};
