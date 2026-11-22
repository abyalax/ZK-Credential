import type { Gpa } from '../../domain/index.js';
import { toGpa } from '../../domain/index.js';

/** Expected user mistake (bad flag, missing file); reported without a stack trace. */
export class CliError extends Error {
  override readonly name = 'CliError';
}

export interface ParsedArgs {
  /** Arguments after the command name, untouched (used to pass flags through to `bench`). */
  readonly raw: readonly string[];
  readonly positional: readonly string[];
  readonly flags: ReadonlyMap<string, string>;
}

/** Supports `--key=value`, `--key value` and bare `--key` (value `true`). */
export const parseArgs = (args: readonly string[]): ParsedArgs => {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [key = '', ...inline] = arg.slice(2).split('=');
    const next = args[index + 1];
    if (inline.length > 0) flags.set(key, inline.join('='));
    else if (next !== undefined && !next.startsWith('--')) {
      flags.set(key, next);
      index += 1;
    } else flags.set(key, 'true');
  }
  return { raw: args, positional, flags };
};

export const requireFlag = (args: ParsedArgs, name: string): string => {
  const value = args.flags.get(name)?.trim();
  if (!value) throw new CliError(`Missing required flag --${name}`);
  return value;
};

const DECIMAL_GPA = /^[0-4](\.\d{1,2})?$/;

/** "3.75" -> 375. Only decimal GPA text is accepted so scaled and unscaled values never mix. */
export const parseGpa = (text: string, flag: string): Gpa => {
  if (!DECIMAL_GPA.test(text)) throw new CliError(`--${flag} must be a GPA like 3.75`);
  const scaled = toGpa(Math.round(Number(text) * 100));
  if (!scaled.ok) throw new CliError(`--${flag} must be between 0.00 and 4.00`);
  return scaled.value;
};
