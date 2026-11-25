import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createFileHolderKeyring,
  createInMemoryHolderKeyring,
  deriveHolderPublicKey,
} from '../../../src/infrastructure/index.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'zk-keyring-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('holder keyring', () => {
  it('keeps one current key and derives its public half from the private half', async () => {
    const keyring = createInMemoryHolderKeyring();
    const [first, second] = await Promise.all([keyring.current(), keyring.current()]);
    expect(second).toEqual(first);
    expect(await deriveHolderPublicKey(first.privateKey)).toBe(first.publicKey);
  });

  it('hands out throwaway keys that never become the current one', async () => {
    const keyring = createInMemoryHolderKeyring();
    const current = await keyring.current();
    const attacker = await keyring.generate();
    expect(attacker.privateKey).not.toBe(current.privateKey);
    expect(await keyring.current()).toEqual(current);
  });

  it('persists in the CLI holder.json shape, readable by a second instance', async () => {
    const path = join(dir, 'holder.json');
    const created = await createFileHolderKeyring(path).current();
    expect(await createFileHolderKeyring(path).current()).toEqual(created);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ publicKey: created.publicKey, privateKey: created.privateKey });
    if (process.platform !== 'win32') expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it('creates the key once when two requests arrive together', async () => {
    const keyring = createFileHolderKeyring(join(dir, 'holder.json'));
    const [a, b] = await Promise.all([keyring.current(), keyring.current()]);
    expect(a).toEqual(b);
  });
});
