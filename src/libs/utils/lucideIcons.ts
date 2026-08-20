import type { IconNode } from 'lucide-react';
import type { IconName } from 'lucide-react/dynamic.js';
import { Logger } from '@/libs/logger/logger';

// The full Lucide catalog ('lucide-react/dynamic.js', ~1960 dynamic-import
// stubs, ~116KB raw) lives behind a lazy import so feed pages that render at
// most a handful of icons do not ship it in their initial bundle. Sync
// callers can therefore only check a name's *shape*; real validation happens
// inside the async loaders against the catalog itself.
const LUCIDE_ICON_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Shape check for a dynamic (kebab-case) Lucide icon name. Accepts names the
 * catalog may not contain (another client's icon set) — rendering falls back
 * once the load resolves null, and foreign names must round-trip unchanged.
 */
export function isPlausibleLucideIconName(name: string | null | undefined): name is IconName {
  return typeof name === 'string' && LUCIDE_ICON_NAME_PATTERN.test(name);
}

let catalogLoad: Promise<typeof import('lucide-react/dynamic.js')> | null = null;

function loadLucideCatalog(): Promise<typeof import('lucide-react/dynamic.js')> {
  if (!catalogLoad) {
    catalogLoad = import('lucide-react/dynamic.js');
    // A failed chunk load (offline) should not poison the session — drop the
    // rejected promise so the next call retries.
    catalogLoad.catch(() => {
      catalogLoad = null;
    });
  }
  return catalogLoad;
}

export interface LucidePickerIcon {
  name: IconName;
  /** Deprecated alias names resolving to this glyph — searchable, not shown. */
  aliases: readonly IconName[];
}

let pickerIconsLoad: Promise<readonly LucidePickerIcon[]> | null = null;

/**
 * Canonical picker entries: every catalog name minus deprecated aliases (same
 * glyph twice), with each canonical name's aliases attached so search matches
 * either (e.g. querying the alias 'home' finds 'house').
 */
export function loadLucidePickerIcons(): Promise<readonly LucidePickerIcon[]> {
  if (!pickerIconsLoad) {
    pickerIconsLoad = Promise.all([loadLucideCatalog(), import('@/libs/utils/lucideIcons.aliases')]).then(
      ([catalog, { LUCIDE_DEPRECATED_ALIAS_TO_CANONICAL }]) => {
        const aliasesByCanonical = new Map<IconName, IconName[]>();
        for (const [alias, canonical] of Object.entries(LUCIDE_DEPRECATED_ALIAS_TO_CANONICAL) as [
          IconName,
          IconName,
        ][]) {
          const aliases = aliasesByCanonical.get(canonical);
          if (aliases) {
            aliases.push(alias);
          } else {
            aliasesByCanonical.set(canonical, [alias]);
          }
        }

        return catalog.iconNames
          .filter((name) => !(name in LUCIDE_DEPRECATED_ALIAS_TO_CANONICAL))
          .map((name) => ({ name, aliases: aliasesByCanonical.get(name) ?? [] }));
      },
    );
    pickerIconsLoad.catch(() => {
      pickerIconsLoad = null;
    });
  }
  return pickerIconsLoad;
}

const loadedIconNodes = new Map<IconName, IconNode>();
const pendingIconLoads = new Map<IconName, Promise<IconNode | null>>();

/**
 * Synchronous cache read. An icon that has resolved once renders on first
 * paint with no loading frame for the rest of the session.
 */
export function getLoadedLucideIconNode(name: IconName): IconNode | undefined {
  return loadedIconNodes.get(name);
}

/**
 * Deduped lazy load of a single icon chunk. Resolves null for a name the
 * catalog does not contain (caller renders its fallback) and on chunk load
 * failure — the pending entry is dropped only for failures, so a later mount
 * can retry (e.g. after coming back online).
 */
export function loadLucideIconNode(name: IconName): Promise<IconNode | null> {
  const loaded = loadedIconNodes.get(name);
  if (loaded) return Promise.resolve(loaded);

  const pending = pendingIconLoads.get(name);
  if (pending) return pending;

  const load = (async (): Promise<IconNode | null> => {
    try {
      const catalog = await loadLucideCatalog();
      const importIcon = catalog.dynamicIconImports[name];
      if (!importIcon) return null;

      const iconModule = await importIcon();
      loadedIconNodes.set(name, iconModule.__iconNode);
      return iconModule.__iconNode;
    } catch (error: unknown) {
      pendingIconLoads.delete(name);
      Logger.warn('Failed to load Lucide icon chunk', { name, error });
      return null;
    }
  })();
  pendingIconLoads.set(name, load);
  return load;
}

/** Fire-and-forget warmup; silently skips names that cannot be Lucide icons. */
export function preloadLucideIcons(names: Iterable<string | null | undefined>): void {
  for (const name of names) {
    if (isPlausibleLucideIconName(name)) void loadLucideIconNode(name);
  }
}
