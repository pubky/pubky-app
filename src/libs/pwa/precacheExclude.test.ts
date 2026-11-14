import { describe, expect, it, vi } from 'vitest';
import { excludeChunksCarrying, type PrecacheExcludeContext } from './precacheExclude';

type Compilation = PrecacheExcludeContext['compilation'];
type ChunkModule =
  ReturnType<Compilation['chunkGraph']['getChunkModulesIterable']> extends Iterable<infer M> ? M : never;

const chunkModule = (resource: string | null, inner: ChunkModule[] = []): ChunkModule => ({
  nameForCondition: () => resource,
  ...(inner.length > 0 && { modules: inner }),
});

/** A fake webpack compilation: each chunk lists its emitted files and the modules it carries. */
const compilationOf = (chunks: { files: string[]; modules: ChunkModule[] }[]) => {
  const byChunk = new Map<object, ChunkModule[]>();
  const chunkObjects = chunks.map(({ files, modules }) => {
    const chunk = { files: new Set(files) };
    byChunk.set(chunk, modules);
    return chunk;
  });
  const getChunkModulesIterable = vi.fn((chunk: object) => byChunk.get(chunk) ?? []);
  const compilation: Compilation = { chunks: new Set(chunkObjects), chunkGraph: { getChunkModulesIterable } };
  return { compilation, getChunkModulesIterable };
};

const exclude = excludeChunksCarrying('pubky-social-migrator');
const isExcluded = (compilation: Compilation, name: string) => exclude({ asset: { name }, compilation });

describe('excludeChunksCarrying', () => {
  const shell = {
    files: ['static/chunks/main-app-1a2b3c.js'],
    modules: [chunkModule('/repo/src/app/layout.tsx'), chunkModule('/repo/node_modules/react/index.js')],
  };
  // Next's `lib` cache group names a >160 KB node_modules module by a hash of its path.
  const migratorGlue = {
    files: ['static/chunks/5f3a1b2c.9d8e7f6a5b4c.js', 'static/chunks/5f3a1b2c.9d8e7f6a5b4c.js.map'],
    modules: [chunkModule('/repo/node_modules/pubky-social-migrator/dist/glue.js')],
  };
  const migratorEntry = {
    files: ['static/chunks/8731.c0ffee.js'],
    modules: [chunkModule('/repo/node_modules/pubky-social-migrator/dist/index.js')],
  };

  it('excludes every file of the chunks that carry the package and nothing else', () => {
    const { compilation } = compilationOf([shell, migratorGlue, migratorEntry]);

    expect(isExcluded(compilation, 'static/chunks/5f3a1b2c.9d8e7f6a5b4c.js')).toBe(true);
    expect(isExcluded(compilation, 'static/chunks/5f3a1b2c.9d8e7f6a5b4c.js.map')).toBe(true);
    expect(isExcluded(compilation, 'static/chunks/8731.c0ffee.js')).toBe(true);
    expect(isExcluded(compilation, 'static/chunks/main-app-1a2b3c.js')).toBe(false);
    expect(isExcluded(compilation, 'static/css/app.css')).toBe(false);
  });

  it('matches the package directory exactly, on either path separator', () => {
    const { compilation } = compilationOf([
      {
        files: ['static/chunks/lookalike.js'],
        modules: [chunkModule('/repo/node_modules/pubky-social-migrator-ui/index.js')],
      },
      {
        files: ['static/chunks/nested.js'],
        modules: [chunkModule('/repo/node_modules/other/node_modules/pubky-social-migrator/x.js')],
      },
      {
        files: ['static/chunks/windows.js'],
        modules: [chunkModule('C:\\repo\\node_modules\\pubky-social-migrator\\dist\\glue.js')],
      },
    ]);

    expect(isExcluded(compilation, 'static/chunks/lookalike.js')).toBe(false);
    expect(isExcluded(compilation, 'static/chunks/nested.js')).toBe(true);
    expect(isExcluded(compilation, 'static/chunks/windows.js')).toBe(true);
  });

  it('looks inside concatenated modules and tolerates modules without a resource', () => {
    const { compilation } = compilationOf([
      {
        files: ['static/chunks/concat.js'],
        modules: [
          chunkModule(null),
          chunkModule('/repo/node_modules/pubky-social-specs/dist/index.js', [
            chunkModule('/repo/node_modules/pubky-social-migrator/dist/index.js'),
          ]),
        ],
      },
      { files: ['static/chunks/runtime.js'], modules: [chunkModule(null)] },
    ]);

    expect(isExcluded(compilation, 'static/chunks/concat.js')).toBe(true);
    expect(isExcluded(compilation, 'static/chunks/runtime.js')).toBe(false);
  });

  it('walks the chunk graph once per compilation', () => {
    const { compilation, getChunkModulesIterable } = compilationOf([shell, migratorGlue, migratorEntry]);

    for (const name of ['a.js', 'b.js', 'static/chunks/8731.c0ffee.js', 'c.js']) isExcluded(compilation, name);

    expect(getChunkModulesIterable).toHaveBeenCalledTimes(3);
    expect(isExcluded(compilationOf([migratorEntry]).compilation, 'static/chunks/8731.c0ffee.js')).toBe(true);
  });
});
