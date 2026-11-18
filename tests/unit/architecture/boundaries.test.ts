import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '../../../src');

/** Layers a given layer must never import from (the dependency rule). */
const forbidden: Record<string, readonly string[]> = {
  shared: ['domain', 'application', 'infrastructure', 'interfaces'],
  domain: ['application', 'infrastructure', 'interfaces'],
  application: ['infrastructure', 'interfaces'],
  infrastructure: ['interfaces'],
};

const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listFiles(path) : path.endsWith('.ts') ? [path] : [];
  });

const importsOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'/g)].map((match) => match[1] ?? '');

describe('layer dependency rule', () => {
  for (const [layer, banned] of Object.entries(forbidden)) {
    it(`${layer} does not import from ${banned.join(', ')}`, () => {
      const violations = listFiles(join(SRC, layer)).flatMap((file) =>
        importsOf(file)
          .filter((spec) => spec.startsWith('.'))
          .filter((spec) => banned.some((b) => new RegExp(`(^|/)${b}(/|$)`).test(spec)))
          .map((spec) => `${file} -> ${spec}`),
      );
      expect(violations).toEqual([]);
    });
  }

  it('domain does not import node built-ins or packages', () => {
    const violations = listFiles(join(SRC, 'domain')).flatMap((file) =>
      importsOf(file)
        .filter((spec) => !spec.startsWith('.'))
        .map((spec) => `${file} -> ${spec}`),
    );
    expect(violations).toEqual([]);
  });
});
