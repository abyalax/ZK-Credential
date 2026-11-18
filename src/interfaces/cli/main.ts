import { runCli } from './run-cli.js';

process.exitCode = runCli(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(`${text}\n`),
  stderr: (text) => process.stderr.write(`${text}\n`),
});
