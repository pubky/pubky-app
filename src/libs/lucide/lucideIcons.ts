import type { IconNode } from 'lucide-react';
import type { IconName } from 'lucide-react/dynamic.js';
import { LUCIDE_ICON_NAME_PATTERN } from '@/config/feed';
import { Logger } from '@/libs/logger/logger';

// The full Lucide catalog ('lucide-react/dynamic.js', ~1960 dynamic-import
// stubs, ~116KB raw) lives behind a lazy import so feed pages that render at
// most a handful of icons do not ship it in their initial bundle. Sync
// callers can therefore only check a name's *shape*; real validation happens
// against the catalog once it is resident.
/**
 * Normalizes a stored icon name to the form the catalog is keyed by, or `null`
 * when it cannot be a Lucide name at all.
 *
 * Case and surrounding whitespace are normalized rather than rejected, so an
 * icon another client wrote as `Activity` still renders its real glyph — the
 * same normalization `FeedValidators.sanitizeIcon` applies before persisting.
 * A name that is merely absent from the catalog stays a valid name here and
 * falls back only once the catalog answers `unknown`.
 */
export function toLucideIconName(name: string | null | undefined): IconName | null {
  const normalized = name?.trim().toLowerCase();
  return normalized && LUCIDE_ICON_NAME_PATTERN.test(normalized) ? (normalized as IconName) : null;
}

type LucideCatalog = typeof import('lucide-react/dynamic.js');

let catalogLoad: Promise<LucideCatalog> | null = null;
// Set once the catalog chunk has resolved, so unknown-name questions can be
// answered synchronously without storing per-name state.
let residentCatalog: LucideCatalog | null = null;

function loadLucideCatalog(): Promise<LucideCatalog> {
  if (!catalogLoad) {
    catalogLoad = import('lucide-react/dynamic.js').then((catalog) => {
      residentCatalog = catalog;
      return catalog;
    });
    // A failed chunk load (offline) should not poison the session — drop the
    // rejected promise so the next call retries.
    catalogLoad.catch(() => {
      catalogLoad = null;
    });
  }
  return catalogLoad;
}

type LucideIconState =
  | { status: 'loading' }
  | { status: 'loaded'; node: IconNode }
  | { status: 'unknown' }
  | { status: 'error' };

const UNKNOWN_ICON_STATE: LucideIconState = { status: 'unknown' };

// External store consumed via useSyncExternalStore. Entries exist only for
// names that are (or might still turn out to be) real catalog names — unknown
// names are answered from the resident catalog instead of stored, so feeds
// synced from a buggy or hostile peer cannot grow this map without bound.
const iconStates = new Map<IconName, LucideIconState>();
const listeners = new Set<() => void>();

function notifyIconStateChange(): void {
  for (const listener of listeners) listener();
}

export function subscribeToLucideIcons(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Synchronous snapshot for useSyncExternalStore. `undefined` means "nothing
 * known yet" (not requested, catalog not resident) — render a size-preserving
 * placeholder. Returned objects are referentially stable between changes.
 */
export function getLucideIconState(name: IconName): LucideIconState | undefined {
  const state = iconStates.get(name);
  if (state) return state;
  if (residentCatalog && !hasCatalogEntry(residentCatalog, name)) return UNKNOWN_ICON_STATE;
  return undefined;
}

/**
 * Own-property check only: `'constructor' in dynamicIconImports` is true and
 * resolves to `Object`, whose "module" has no `__iconNode` — rendering that
 * would throw. Feed icons are peer-controlled, so this is reachable input.
 */
function hasCatalogEntry(catalog: LucideCatalog, name: IconName): boolean {
  return Object.hasOwn(catalog.dynamicIconImports, name);
}

/**
 * Idempotent load request. A name already loading/loaded/unknown is a no-op;
 * an `error` state retries — and because state is shared, a retry that
 * succeeds heals every mounted subscriber, so one transient offline blip
 * cannot pin a long-lived surface (the feed tab bar) to its fallback.
 */
export function requestLucideIcon(name: IconName): void {
  const current = getLucideIconState(name);
  if (current && current.status !== 'error') return;

  // Deliberately not notifying: `loading` and "never requested" both render the
  // same empty svg, so waking every subscriber here cannot change any output.
  iconStates.set(name, { status: 'loading' });

  void (async () => {
    try {
      const catalog = await loadLucideCatalog();
      if (!hasCatalogEntry(catalog, name)) {
        // The resident catalog answers this name from now on — drop the entry
        // so peer-controlled garbage names leave nothing behind.
        iconStates.delete(name);
        notifyIconStateChange();
        return;
      }

      // The picker's bundle may have landed while this request was in flight;
      // overwriting an identical node would only churn every subscriber.
      if (getLucideIconState(name)?.status === 'loaded') return;

      const iconModule = await catalog.dynamicIconImports[name]();
      if (!iconModule?.__iconNode) {
        iconStates.delete(name);
        notifyIconStateChange();
        return;
      }

      iconStates.set(name, { status: 'loaded', node: iconModule.__iconNode });
      notifyIconStateChange();
    } catch (error: unknown) {
      Logger.warn('Failed to load Lucide icon chunk', { name, error });
      iconStates.set(name, { status: 'error' });
      notifyIconStateChange();
      listenForReconnect();
    }
  })();
}

let reconnectListenerAttached = false;

/**
 * The realistic cause of a failed chunk is a dropped connection, and nothing
 * re-requests an icon that is already mounted. Retrying every failed name once
 * the browser reports it is back online heals them without polling — bounded,
 * because a retry that fails again simply re-arms this same listener.
 */
function listenForReconnect(): void {
  if (reconnectListenerAttached || typeof window === 'undefined') return;
  reconnectListenerAttached = true;

  window.addEventListener(
    'online',
    () => {
      reconnectListenerAttached = false;
      for (const [name, state] of iconStates) {
        if (state.status === 'error') requestLucideIcon(name);
      }
    },
    { once: true },
  );
}

/** Fire-and-forget warmup; silently skips names that cannot be Lucide icons. */
export function preloadLucideIcons(names: Iterable<string | null | undefined>): void {
  for (const name of names) {
    const iconName = toLucideIconName(name);
    if (iconName) requestLucideIcon(iconName);
  }
}

let allIconNodesLoad: Promise<readonly IconName[]> | null = null;

/**
 * Loads every canonical icon in one chunk and fills the store with it.
 *
 * The picker renders up to ~1700 cells and lucide ships one chunk per icon, so
 * the per-icon path costs one request per cell (~539B on the wire, ~920KB over
 * a full scroll). This is a single ~109KB chunk, after which every cell renders
 * synchronously and issues no request at all. Returns the canonical names so
 * the picker can enumerate without also pulling the catalog.
 */
function loadAllLucideIconNodes(): Promise<readonly IconName[]> {
  if (!allIconNodesLoad) {
    allIconNodesLoad = import('@/libs/lucide/lucideIcons.nodes').then(({ LUCIDE_ICON_NODES }) => {
      const names = Object.keys(LUCIDE_ICON_NODES) as IconName[];
      for (const name of names) {
        const node = LUCIDE_ICON_NODES[name];
        if (node) iconStates.set(name, { status: 'loaded', node });
      }
      notifyIconStateChange();
      return names;
    });
    allIconNodesLoad.catch(() => {
      allIconNodesLoad = null;
    });
  }
  return allIconNodesLoad;
}

export interface LucidePickerIcon {
  name: IconName;
  /** Deprecated alias names resolving to this glyph — searchable, not shown. */
  aliases: readonly IconName[];
  /**
   * Search synonyms from lucide's tag metadata ('delete' finds trash icons),
   * stored hyphenated so a multi-word query ('air conditioner', normalized to
   * 'air-conditioner' by the picker) matches the same way a single word does.
   */
  tags: readonly string[];
}

let pickerIconsLoad: Promise<readonly LucidePickerIcon[]> | null = null;

/**
 * Canonical picker entries: every catalog name minus deprecated aliases (same
 * glyph twice), with each canonical name's aliases and search tags attached so
 * search matches any of them (the alias 'home' and the tag 'residence' both
 * find 'house'). Loaded lazily together with the catalog chunk.
 */
export function loadLucidePickerIcons(): Promise<readonly LucidePickerIcon[]> {
  if (!pickerIconsLoad) {
    pickerIconsLoad = Promise.all([
      loadAllLucideIconNodes(),
      import('@/libs/lucide/lucideIcons.aliases'),
      import('@/libs/lucide/lucideIcons.tags'),
    ]).then(([canonicalNames, { LUCIDE_DEPRECATED_ALIAS_TO_CANONICAL }, { LUCIDE_ICON_TAGS }]) => {
      const aliasesByCanonical = new Map<IconName, IconName[]>();
      for (const [alias, canonical] of Object.entries(LUCIDE_DEPRECATED_ALIAS_TO_CANONICAL) as [IconName, IconName][]) {
        const aliases = aliasesByCanonical.get(canonical);
        if (aliases) {
          aliases.push(alias);
        } else {
          aliasesByCanonical.set(canonical, [alias]);
        }
      }

      // The bundle is already alias-free, so nothing needs filtering out here.
      return canonicalNames.map((name) => ({
        name,
        aliases: aliasesByCanonical.get(name) ?? [],
        tags: (Object.hasOwn(LUCIDE_ICON_TAGS, name) ? (LUCIDE_ICON_TAGS[name] ?? []) : []).map((tag) =>
          tag.replace(/\s+/g, '-'),
        ),
      }));
    });
    pickerIconsLoad.catch(() => {
      pickerIconsLoad = null;
    });
  }
  return pickerIconsLoad;
}
