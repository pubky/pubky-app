import type { LeafRequest } from '../crawler.types';
import { CURSOR_ZERO } from '../cursor';
import { createIndexerRuntime } from '../indexer';
import { IndexerNotStartedError } from '../indexer.errors';
import type { Coverage, Cursor, Entry, MergedRuns, RecordEntry } from '../indexer.types';
import type { Coordination, RuntimeOptions, RuntimeStatus, Schedule } from '../runtime.types';
import { scopeId } from '../store.helpers';
import type { IndexStore, ScopeKey } from '../store.types';
import type { IndexerTransport } from '../transport.types';
import { createNexusRouter, type NexusRequest, type NexusResponse, type NexusRouter } from './nexusRouter';
import { createSocialQueries } from './queries/socialQueries';
import { createSocialDomain, locate, POSTS_PREFIX, PROFILE_PATH, SOCIAL_ACTIVITY, SOCIAL_GRAPH } from './social.domain';
import type { AuthorRecords, GroupHistory, Membership, SocialData } from './social.types';
import { buildSocialView, type SocialView } from './social.view';

const POST_GROUP_PREFIX = 'post:';

export interface SocialIndexerParams {
  transport: IndexerTransport;
  store: IndexStore<SocialData>;
  /** Wall clock in ms. */
  now: () => number;
  schedule?: Schedule;
  coordination?: Coordination | null;
  options?: Partial<RuntimeOptions>;
}

export interface SocialChange {
  /** Authors whose records or membership changed, or who entered or left the view. */
  authors: string[];
}

/** The social runtime with its view kept current, answering the central indexer's requests locally. */
export interface SocialIndexer {
  /**
   * Starts for the signed-in user, or with `null` as a visitor: then nothing is synced as a scope and no saved index is
   * read or written, but users and posts load on demand, and answers about them come from what was loaded.
   */
  start(seed: string | null): void;
  stop(): void;
  pause(): void;
  resume(): void;
  /** Resolves once committed; the view follows with the next change. */
  refresh(users?: readonly string[]): Promise<void>;
  /**
   * Loads a user outside the scope and keeps them in the view with their own records, outside the scope's answers.
   * Resolves once the view holds what was loaded.
   */
  ensureUser(user: string): Promise<void>;
  /**
   * Loads one post with its whole history and keeps it resolvable by key, for a post the scope does not hold. Its
   * author joins no stream, ranking or count.
   */
  ensurePost(author: string, postId: string): Promise<void>;
  backfill(author: string, group: string, pages: number): Promise<void>;
  /** An empty view until the first build. */
  view(): SocialView;
  /**
   * Resolves once a view holds the seed's own scopes: from the store, from a loaded index file, or after the first
   * sync committed the seed's hop, whichever comes first. A seed whose homeserver does not resolve or cannot be read
   * makes it resolve once that attempt is over, with `status().stats.seed` saying which.
   */
  ready(): Promise<void>;
  /** Resolves once the first scope sync of this run has settled, failed included, and the view holds what it committed. */
  whenSynced(): Promise<void>;
  /** Answers once `ready`; rejects with `IndexerNotStartedError` before `start` or after `stop`. */
  request(request: NexusRequest): Promise<NexusResponse>;
  /** Called after each view rebuild that changed something. */
  onChange(listener: (change: SocialChange) => void): () => void;
  status(): RuntimeStatus;
  onStatus(listener: (status: RuntimeStatus) => void): () => void;
}

/** The leaf scope holding every version of one post. */
export const postLeaf = (author: string, postId: string): LeafRequest => ({
  author,
  group: `${POST_GROUP_PREFIX}${postId}`,
  paths: [`${POSTS_PREFIX}${postId}/`],
});

const NOTHING: MergedRuns<SocialData> = { entries: new Map(), live: new Map(), coverage: [], trusted: null };

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

const sameCoverage = (a: Coverage, b: Coverage) =>
  a.length === b.length && a.every((range, i) => range.tail === b[i].tail && range.head === b[i].head);

const historyOf = ({ trusted }: MergedRuns<SocialData>): GroupHistory => ({
  complete: trusted !== null && trusted.tail === CURSOR_ZERO,
  tail: trusted === null ? null : trusted.tail,
});

/** Whether the entry lies in the scope's trusted range, where no later event can hide in a gap. */
const isTrusted = ({ trusted }: MergedRuns<SocialData>, { cursor }: Entry<SocialData>): boolean =>
  trusted !== null && cursor > trusted.tail && cursor <= trusted.head;

/** The posts whose every version's newest entry over these scopes of one author is a trusted tombstone. */
function deletedPosts(author: string, scopes: readonly MergedRuns<SocialData>[]): Set<string> {
  const newest = new Map<string, { cursor: Cursor; proof: boolean }>();
  for (const scope of scopes) {
    for (const [path, entry] of scope.entries) {
      const proof = entry.kind === 'tombstone' && isTrusted(scope, entry);
      const known = newest.get(path);
      // One event seen by two scopes proves what the more trusted one says.
      if (known !== undefined && known.cursor === entry.cursor) known.proof = known.proof || proof;
      else if (known === undefined || entry.cursor > known.cursor) newest.set(path, { cursor: entry.cursor, proof });
    }
  }
  const verdicts = new Map<string, boolean>();
  for (const [path, { proof }] of newest) {
    const at = locate(author, path);
    if (at === null || at.kind !== 'post' || at.editId === undefined) continue;
    verdicts.set(at.id, (verdicts.get(at.id) ?? true) && proof);
  }
  return new Set([...verdicts].flatMap(([postId, deleted]) => (deleted ? [postId] : [])));
}

/** What the store holds for one author of the view. */
interface Loaded {
  homeserver: string;
  membership: Membership;
  hop: number | null;
  graph: MergedRuns<SocialData>;
  activity: MergedRuns<SocialData>;
  /** The leaf scopes of the author's ensured posts. */
  leaves: MergedRuns<SocialData>[];
}

function authorRecords(author: string, loaded: Loaded): AuthorRecords {
  const { homeserver, membership, hop, graph, activity, leaves } = loaded;
  const loose = new Map<string, RecordEntry<SocialData>>();
  for (const leaf of leaves) {
    for (const [path, record] of leaf.live) {
      const stored = activity.entries.get(path);
      if (stored === undefined || record.cursor > stored.cursor) loose.set(path, record);
    }
  }
  const profile = graph.entries.get(PROFILE_PATH);
  return {
    author,
    homeserver,
    membership,
    hop,
    graph: graph.live,
    activity: activity.live,
    loose,
    deleted: {
      posts: deletedPosts(author, [activity, ...leaves]),
      profile: profile !== undefined && profile.kind === 'tombstone' && isTrusted(graph, profile),
    },
    history: { graph: historyOf(graph), activity: historyOf(activity) },
  };
}

/** Each user's membership, so that a change of it alone counts as a change of the user. */
const membershipsOf = (loaded: ReadonlyMap<string, Loaded>) =>
  new Map([...loaded].map(([author, { membership }]): [string, Membership] => [author, membership]));

export function createSocialIndexer(params: SocialIndexerParams): SocialIndexer {
  const { store, now } = params;
  const runtime = createIndexerRuntime({ ...params, domain: createSocialDomain() });
  const empty = buildSocialView([]);

  let seed: string | null = null;
  let started = false;
  /** Bumped by each start, so a rebuild begun for an earlier one is dropped. */
  let generation = 0;
  let current = empty;
  let currentMemberships = new Map<string, Membership>();
  let routed: { view: SocialView; syncing: boolean; router: NexusRouter } | null = null;
  let viewError: Error | null = null;
  let firstSyncSettled = false;
  const ensuredUsers = new Set<string>();
  const ensuredPosts = new Map<string, LeafRequest>();
  /** Merged scopes by scope id, with the scope's change count when read. */
  const cache = new Map<string, { merged: MergedRuns<SocialData>; changes: number }>();
  /** Per scope id, the changes reported for it: data filled in at a stored cursor leaves the coverage as it was. */
  const changeCounts = new Map<string, number>();
  let pendingAuthors = new Set<string>();
  let rebuilding: Promise<void> | null = null;
  let again = false;
  const listeners = new Set<(change: SocialChange) => void>();

  let markReady: () => void = () => undefined;
  let readyPromise = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  let markSynced: () => void = () => undefined;
  let syncedPromise = new Promise<void>((resolve) => {
    markSynced = resolve;
  });

  /**
   * The scope from the cache while its coverage is unchanged and no change was reported for it: every applied run
   * adds its range to the coverage, and a run inside it can only repeat what is stored or fill in a body, which is
   * reported as a change.
   */
  async function served(scope: ScopeKey): Promise<MergedRuns<SocialData>> {
    const id = scopeId(scope);
    const changes = changeCounts.get(id) ?? 0;
    const known = cache.get(id);
    if (
      known !== undefined &&
      known.changes === changes &&
      sameCoverage(known.merged.coverage, await store.readCoverage(scope))
    ) {
      return known.merged;
    }
    const merged = await store.readScope(scope);
    cache.set(id, { merged, changes });
    return merged;
  }

  async function homeserverOf(user: string): Promise<string | null> {
    return (await store.readUserHomeserver(user))?.homeserver ?? null;
  }

  /** A referenced author brings only their graph, for the profile. */
  async function load(loaded: Map<string, Loaded>, author: string, membership: Membership, hop: number | null) {
    if (loaded.has(author)) return;
    const homeserver = await homeserverOf(author);
    if (homeserver === null) return;
    const graph = await served({ author, homeserver, group: SOCIAL_GRAPH });
    const activity =
      membership === 'referenced' ? NOTHING : await served({ author, homeserver, group: SOCIAL_ACTIVITY });
    loaded.set(author, { homeserver, membership, hop, graph, activity, leaves: [] });
  }

  /** Adds each ensured post's leaf scope to its author, who is referenced when not loaded otherwise. */
  async function addLeaves(loaded: Map<string, Loaded>): Promise<void> {
    for (const leaf of ensuredPosts.values()) {
      const homeserver = await homeserverOf(leaf.author);
      if (homeserver === null) continue;
      const scope = await served({ author: leaf.author, homeserver, group: leaf.group });
      if (scope.entries.size === 0) continue;
      await load(loaded, leaf.author, 'referenced', null);
      const target = loaded.get(leaf.author);
      // Cursors of two homeservers never compare.
      if (target !== undefined && target.homeserver === homeserver) target.leaves.push(scope);
    }
  }

  async function buildOnce(
    forSeed: string | null,
  ): Promise<{ view: SocialView; memberships: Map<string, Membership>; hasScope: boolean }> {
    const members = forSeed === null ? new Map<string, number>() : await store.readScopeMembers(forSeed);
    const hops = new Map<string, number>(members);
    if (forSeed !== null && !hops.has(forSeed)) hops.set(forSeed, 0);
    const loaded = new Map<string, Loaded>();
    for (const [author, hop] of hops) await load(loaded, author, 'member', hop);
    for (const user of ensuredUsers) if (!hops.has(user)) await load(loaded, user, 'visited', null);
    await addLeaves(loaded);
    const records = [...loaded].map(([author, entry]) => authorRecords(author, entry));
    return { view: buildSocialView(records), memberships: membershipsOf(loaded), hasScope: members.size > 0 };
  }

  async function runRebuilds(): Promise<void> {
    do {
      again = false;
      const run = generation;
      const forSeed = seed;
      if (!started) break;
      const settled = firstSyncSettled;
      const changed = pendingAuthors;
      pendingAuthors = new Set();
      try {
        const { view, memberships, hasScope } = await buildOnce(forSeed);
        // Started again meanwhile: its own rebuild follows.
        if (generation !== run) continue;
        for (const [author, membership] of memberships) {
          if (currentMemberships.get(author) !== membership) changed.add(author);
        }
        for (const author of currentMemberships.keys()) if (!memberships.has(author)) changed.add(author);
        current = view;
        currentMemberships = memberships;
        viewError = null;
        if (hasScope || settled) markReady();
        if (settled) markSynced();
        if (changed.size > 0) {
          const change = { authors: [...changed] };
          for (const listener of listeners) listener(change);
        }
      } catch (error) {
        viewError = asError(error);
      }
    } while (again);
    rebuilding = null;
  }

  /** Resolves when a rebuild that started after this call has finished. */
  function requestRebuild(authors: Iterable<string>): Promise<void> {
    for (const author of authors) pendingAuthors.add(author);
    if (rebuilding !== null) {
      again = true;
      return rebuilding;
    }
    rebuilding = runRebuilds();
    return rebuilding;
  }

  runtime.onChange((change) => {
    for (const scope of change.scopes) {
      const id = scopeId(scope);
      changeCounts.set(id, (changeCounts.get(id) ?? 0) + 1);
    }
    void requestRebuild(change.scopes.map(({ author }) => author));
  });

  // A first sync that failed still makes the view ready, empty or not, rather than leaving requests waiting.
  runtime.onStatus((status) => {
    if (firstSyncSettled || status.state === 'stopped' || status.seed !== seed || status.firstSyncPending) return;
    firstSyncSettled = true;
    void requestRebuild([]);
  });

  const status = (): RuntimeStatus => {
    const base = runtime.status();
    return viewError === null || base.state === 'stopped' ? base : { ...base, state: 'error', lastError: viewError };
  };

  return {
    start(next) {
      if (started && seed === next) return;
      if (generation > 0 && seed !== next) {
        current = empty;
        currentMemberships = new Map();
        routed = null;
        ensuredUsers.clear();
        ensuredPosts.clear();
        cache.clear();
        readyPromise = new Promise<void>((resolve) => {
          markReady = resolve;
        });
      }
      // A visitor has no scope to sync.
      firstSyncSettled = next === null;
      syncedPromise = new Promise<void>((resolve) => {
        markSynced = resolve;
      });
      generation += 1;
      seed = next;
      started = true;
      runtime.start(next);
      // The store may hold a previous session's scope, served before any network.
      void requestRebuild([]);
    },
    stop() {
      started = false;
      runtime.stop();
    },
    pause: () => runtime.pause(),
    resume: () => runtime.resume(),
    refresh: (users) => runtime.refresh(users),
    ensureUser(user) {
      if (!ensuredUsers.has(user)) {
        ensuredUsers.add(user);
        void requestRebuild([]);
      }
      return runtime.ensureUser(user).then(() => requestRebuild([]));
    },
    ensurePost(author, postId) {
      const leaf = postLeaf(author, postId);
      const key = JSON.stringify([author, leaf.group]);
      if (!ensuredPosts.has(key)) {
        ensuredPosts.set(key, leaf);
        void requestRebuild([]);
      }
      return runtime.ensureLeaf(leaf).then(() => requestRebuild([]));
    },
    backfill: (author, group, pages) => runtime.backfill(author, group, pages),
    view: () => current,
    ready: () => readyPromise,
    whenSynced: () => syncedPromise,
    async request(request) {
      if (!started) throw new IndexerNotStartedError();
      await readyPromise;
      if (!started) throw new IndexerNotStartedError();
      const syncing = !firstSyncSettled;
      if (routed === null || routed.view !== current || routed.syncing !== syncing) {
        const queries = createSocialQueries(current, { seed, now, syncing });
        routed = { view: current, syncing, router: createNexusRouter(queries) };
      }
      return { ...(await routed.router.route(request)), syncing };
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    status,
    onStatus: (listener) => runtime.onStatus(() => listener(status())),
  };
}
