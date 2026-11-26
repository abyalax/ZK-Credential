import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '../src');

/** Layers a given layer must never import from (see docs/ui/architecture.md). */
const forbidden: Record<string, readonly string[]> = {
  shared: ['domain', 'application', 'infrastructure', 'features', 'ui', 'app'],
  domain: ['application', 'infrastructure', 'features', 'ui', 'app'],
  application: ['infrastructure', 'features', 'ui', 'app'],
  infrastructure: ['features', 'ui', 'app'],
  features: ['infrastructure', 'app'],
  ui: ['domain', 'application', 'infrastructure', 'features', 'app'],
};

const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listFiles(path) : /\.tsx?$/.test(path) ? [path] : [];
  });

const importsOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'/g)].map((match) => match[1] ?? '');

const targetLayer = (spec: string): string | undefined => {
  if (spec.startsWith('@/')) return spec.slice(2).split('/')[0];
};

describe('web layer dependency rule', () => {
  for (const [layer, banned] of Object.entries(forbidden)) {
    it(`${layer} does not import from ${banned.join(', ')}`, () => {
      const violations = listFiles(join(SRC, layer)).flatMap((file) =>
        importsOf(file)
          .filter((spec) => banned.includes(targetLayer(spec) ?? ''))
          .map((spec) => `${file} -> ${spec}`),
      );
      expect(violations).toEqual([]);
    });
  }

  it('domain and shared import no packages', () => {
    const violations = ['domain', 'shared'].flatMap((layer) =>
      listFiles(join(SRC, layer)).flatMap((file) =>
        importsOf(file)
          .filter((spec) => !(spec.startsWith('.') || spec.startsWith('@/')))
          .map((spec) => `${file} -> ${spec}`),
      ),
    );
    expect(violations).toEqual([]);
  });

  it('features do not reach into each other', () => {
    const violations = listFiles(join(SRC, 'features')).flatMap((file) => {
      const own = file.slice(join(SRC, 'features').length + 1).split(/[\\/]/)[0];
      return importsOf(file)
        .filter((spec) => spec.startsWith('..') && /\.\.\/(issuer|holder|verifier|simulator)\//.test(spec))
        .filter((spec) => !spec.includes(`../${own}/`))
        .map((spec) => `${file} -> ${spec}`);
    });
    expect(violations).toEqual([]);
  });
});
