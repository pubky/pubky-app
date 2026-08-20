import type { IconNode } from 'lucide-react';
import { dynamicIconImports, type IconName, iconNames } from 'lucide-react/dynamic.js';
import { Logger } from '@/libs/logger/logger';
import { LUCIDE_DEPRECATED_ALIAS_NAMES } from '@/libs/utils/lucideIcons.aliases';

export const LUCIDE_ICON_NAMES: readonly IconName[] = iconNames;

const LUCIDE_ICON_NAME_SET = new Set<string>(LUCIDE_ICON_NAMES);

const LUCIDE_DEPRECATED_ALIAS_NAME_SET = new Set<string>(LUCIDE_DEPRECATED_ALIAS_NAMES);

/**
 * Canonical names only — what the icon picker offers. Deprecated aliases
 * resolve to the same glyph as their canonical name, so listing them would
 * show duplicates; they remain valid for validation and rendering.
 */
export const LUCIDE_CANONICAL_ICON_NAMES: readonly IconName[] = LUCIDE_ICON_NAMES.filter(
  (name) => !LUCIDE_DEPRECATED_ALIAS_NAME_SET.has(name),
);

export function isLucideIconName(name: string | null | undefined): name is IconName {
  return typeof name === 'string' && LUCIDE_ICON_NAME_SET.has(name);
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
 * Deduped lazy load of a single icon chunk. Resolves null on failure so
 * callers keep their placeholder; the pending entry is dropped so a later
 * mount can retry (e.g. after coming back online).
 */
export function loadLucideIconNode(name: IconName): Promise<IconNode | null> {
  const loaded = loadedIconNodes.get(name);
  if (loaded) return Promise.resolve(loaded);

  const pending = pendingIconLoads.get(name);
  if (pending) return pending;

  const load = dynamicIconImports[name]()
    .then((module) => {
      loadedIconNodes.set(name, module.__iconNode);
      return module.__iconNode;
    })
    .catch((error: unknown) => {
      pendingIconLoads.delete(name);
      Logger.warn('Failed to load Lucide icon chunk', { name, error });
      return null;
    });
  pendingIconLoads.set(name, load);
  return load;
}

/** Fire-and-forget warmup; silently skips names that are not Lucide icons. */
export function preloadLucideIcons(names: Iterable<string | null | undefined>): void {
  for (const name of names) {
    if (isLucideIconName(name)) void loadLucideIconNode(name);
  }
}
