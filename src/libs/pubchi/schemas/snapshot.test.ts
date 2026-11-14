import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from './canonical';
import { projectTargetSnapshot } from './snapshot';

const fixtures = import.meta.glob('./__fixtures__/snapshot/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, SnapshotFixture | Record<string, string>>;

type SnapshotFixture = {
  input: {
    target: { kind: 'post' | 'user'; uri: string; author?: string; pubky?: string };
    post: { details?: { author?: string; content?: string; kind?: string } } | null;
    user: { name?: string; bio?: string | null } | null;
  };
  projection: Record<string, string | null>;
  snapshot_sha256: string;
};

function fixtureName(path: string): string {
  return path.split('/').at(-1) ?? path;
}

describe('shared snapshot projection fixtures', () => {
  it('matches the service manifest bytes', async () => {
    const manifest = Object.values(fixtures).find((fixture) => !('input' in fixture)) as Record<string, string>;
    for (const [path, fixture] of Object.entries(fixtures)) {
      const name = fixtureName(path);
      if (name === 'MANIFEST.json') continue;
      expect(await sha256Hex(JSON.stringify(fixture, null, 2) + '\n')).toBe(manifest[name]);
    }
  });

  for (const [path, fixture] of Object.entries(fixtures)) {
    if (fixtureName(path) === 'MANIFEST.json') continue;
    it(`matches ${fixtureName(path)}`, async () => {
      const entry = fixture as SnapshotFixture;
      const source = entry.input.target.kind === 'post' ? (entry.input.post?.details ?? null) : entry.input.user;
      const projection = projectTargetSnapshot(entry.input.target, source);
      expect(projection).toEqual(entry.projection);
      expect(await sha256Hex(canonicalJson(projection))).toBe(entry.snapshot_sha256);
    });
  }
});
