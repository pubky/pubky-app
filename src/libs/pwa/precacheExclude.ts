/**
 * Build-time helper for the service worker precache (`withSerwistInit` in `next.config.ts`).
 * Runs in Node during `next build`; never imported by app code. The structural types below are
 * the slice of webpack's `Compilation` the helper reads, so it needs no webpack import.
 */

interface ChunkModule {
  nameForCondition?: () => string | null;
  /** Inner modules of a webpack `ConcatenatedModule`, whose `nameForCondition` reports only its root. */
  modules?: Iterable<ChunkModule>;
}

interface Chunk {
  files: Iterable<string>;
}

interface Compilation {
  chunks: Iterable<Chunk>;
  chunkGraph: {
    getChunkModulesIterable(chunk: Chunk): Iterable<ChunkModule>;
  };
}

export interface PrecacheExcludeContext {
  asset: { name: string };
  compilation: Compilation;
}

const moduleIsFromPackage = (module: ChunkModule, packagePath: string): boolean => {
  const resource = module.nameForCondition?.() ?? '';
  if (resource.split('\\').join('/').includes(packagePath)) return true;
  for (const inner of module.modules ?? []) {
    if (moduleIsFromPackage(inner, packagePath)) return true;
  }
  return false;
};

const chunkCarriesPackage = (compilation: Compilation, chunk: Chunk, packagePath: string): boolean => {
  for (const chunkModule of compilation.chunkGraph.getChunkModulesIterable(chunk)) {
    if (moduleIsFromPackage(chunkModule, packagePath)) return true;
  }
  return false;
};

/**
 * Serwist `exclude` predicate: true for every webpack asset emitted by a chunk that carries a
 * module from `node_modules/<packageName>/`.
 *
 * Why not a file-name pattern: Next.js names a client chunk holding a node_modules module larger
 * than 160 KB by a hash of the module path (its `lib` cache group), so neither the package name
 * nor a `webpackChunkName` comment survives into the asset name. The chunk graph is the stable
 * signal.
 *
 * A chunk created by a dynamic `import()` only carries modules its parents do not, so when the
 * package is loaded that way nothing the app shell needs is dropped with it. A static import would
 * put the package into a shell chunk and take that chunk out of the precache, which shows up as a
 * size drop on the `(serwist)` build line (docs/pwa.md, "Precache diet").
 */
export function excludeChunksCarrying(packageName: string): (context: PrecacheExcludeContext) => boolean {
  const packagePath = `/node_modules/${packageName}/`;
  // One chunk-graph walk per compilation; the predicate itself runs once per emitted asset.
  const carryingFiles = new WeakMap<Compilation, Set<string>>();

  return ({ asset, compilation }) => {
    let files = carryingFiles.get(compilation);
    if (!files) {
      files = new Set<string>();
      for (const chunk of compilation.chunks) {
        if (!chunkCarriesPackage(compilation, chunk, packagePath)) continue;
        for (const file of chunk.files) files.add(file);
      }
      carryingFiles.set(compilation, files);
    }
    return files.has(asset.name);
  };
}
