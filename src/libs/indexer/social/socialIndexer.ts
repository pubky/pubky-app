import type { LeafRequest } from '../crawler.types';
import { CURSOR_ZERO } from '../cursor';
import { createIndexerRuntime } from '../indexer';
import { IndexerError } from '../indexer.errors';
import type { Coverage, MergedRuns, RecordEntry } from '../indexer.types';
import type { Coordination, RuntimeOptions, RuntimeStatus, Schedule } from '../runtime.types';
import { scopeId } from '../store.helpers';
import type { IndexStore, ScopeKey } from '../store.types';
import type { IndexerTransport } from '../transport.types';
import { createNexusRouter, type NexusRequest, type NexusResponse, type NexusRouter } from './nexusRouter';
import { createSocialQueries } from './queries/socialQueries';
import { createSocialDomain, POSTS_PREFIX, SOCIAL_ACTIVITY, SOCIAL_GRAPH } from './social.domain';
import type { AuthorRecords, GroupHistory, SocialData } from './social.types';
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
  /** Authors whose records changed, or who entered or left the view. */
  authors: string[];
}

/** The social runtime with its view kept current, answering the central indexer's requests locally. */
export interface SocialIndexer {
  start(seed: string): void;
  stop(): void;
  pause(): void;
  resume(): void;
  /** Resolves once committed; the view follows with the next change. */
  refresh(users?: readonly string[]): Promise<void>;
  /** Loads a user outside the scope and keeps them in the view. Resolves once the view holds what was loaded. */
  ensureUser(user: string): Promise<void>;
  /** Loads one post with its whole history and keeps it in the view, for a post the scope does not hold. */
  ensurePost(author: string, postId: string): Promise<void>;
  backfill(author: string, group: string, pages: number): Promise<void>;
  /** An empty view until the first build. */
  view(): SocialView;
  /** Resolves once a view was built from a stored scope, or from the store after the first sync. */
  ready(): Promise<void>;
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

/** What the store holds for one author of the view. */
interface Loaded {
  homeserver: string;
  hop: number | null;
  graph: MergedRuns<SocialData>;
  activity: MergedRuns<SocialData>;
  /** Records of ensured posts the activity scope does not know at a higher cursor. */
  leaves: Map<string, RecordEntry<SocialData>>;
}

function authorRecords(author: string, { homeserver, hop, graph, activity, leaves }: Loaded): AuthorRecords {
  return {
    author,
    homeserver,
    hop,
    graph: graph.live,
    activity: leaves.size === 0 ? activity.live : new Map([...activity.live, ...leaves]),
    history: { graph: historyOf(graph), activity: historyOf(activity) },
  };
}

export function createSocialIndexer(params: SocialIndexerParams): SocialIndexer {
  const { store, now } = params;
  const runtime = createIndexerRuntime({ ...params, domain: createSocialDomain() });
  const empty = buildSocialView([]);

  let seed: string | null = null;
  let current = empty;
  let routed: { view: SocialView; router: NexusRouter } | null = null;
  let viewError: Error | null = null;
  let firstSyncSettled = false;
  const ensuredUsers = new Set<string>();
  const ensuredPosts = new Map<string, LeafRequest>();
  /** Merged scopes by scope id. */
  const cache = new Map<string, MergedRuns<SocialData>>();
  let pendingAuthors = new Set<string>();
  let rebuilding: Promise<void> | null = null;
  let again = false;
  const listeners = new Set<(change: SocialChange) => void>();

  let markReady: () => void = () => undefined;
  let readyPromise = new Promise<void>((resolve) => {
    markReady = resolve;
  });

  /**
   * The scope from the cache while its coverage is unchanged: every applied run adds its range to the coverage,
   * and a run inside it can only repeat what is stored, so the same coverage means the same scope.
   */
  async function served(scope: ScopeKey): Promise<MergedRuns<SocialData>> {
    const id = scopeId(scope);
    const known = cache.get(id);
    if (known !== undefined && sameCoverage(known.coverage, await store.readCoverage(scope))) return known;
    const read = await store.readScope(scope);
    cache.set(id, read);
    return read;
  }

  async function homeserverOf(user: string): Promise<string | null> {
    return (await store.readUserHomeserver(user))?.homeserver ?? null;
  }

  /** Merges each ensured post into its author, who joins the view without a hop when not in it yet. */
  async function addLeaves(loaded: Map<string, Loaded>): Promise<void> {
    for (const leaf of ensuredPosts.values()) {
      const homeserver = await homeserverOf(leaf.author);
      if (homeserver === null) continue;
      const { live } = await served({ author: leaf.author, homeserver, group: leaf.group });
      if (live.size === 0) continue;
      const known = loaded.get(leaf.author);
      // Cursors of two homeservers never compare.
      if (known !== undefined && known.homeserver !== homeserver) continue;
      const target: Loaded = known ?? { homeserver, hop: null, graph: NOTHING, activity: NOTHING, leaves: new Map() };
      loaded.set(leaf.author, target);
      for (const [path, record] of live) {
        const stored = target.activity.entries.get(path);
        if (stored === undefined || record.cursor > stored.cursor) target.leaves.set(path, record);
      }
    }
  }

  async function buildOnce(forSeed: string): Promise<{ view: SocialView; hasScope: boolean }> {
    const members = await store.readScopeMembers(forSeed);
    const hops = new Map<string, number | null>(members);
    if (!hops.has(forSeed)) hops.set(forSeed, 0);
    for (const user of ensuredUsers) if (!hops.has(user)) hops.set(user, null);
    const loaded = new Map<string, Loaded>();
    for (const [author, hop] of hops) {
      const homeserver = await homeserverOf(author);
      if (homeserver === null) continue;
      const graph = await served({ author, homeserver, group: SOCIAL_GRAPH });
      const activity = await served({ author, homeserver, group: SOCIAL_ACTIVITY });
      loaded.set(author, { homeserver, hop, graph, activity, leaves: new Map() });
    }
    await addLeaves(loaded);
    const records = [...loaded].map(([author, entry]) => authorRecords(author, entry));
    return { view: buildSocialView(records), hasScope: members.size > 0 };
  }

  async function runRebuilds(): Promise<void> {
    do {
      again = false;
      const forSeed = seed;
      if (forSeed === null) break;
      const changed = pendingAuthors;
      pendingAuthors = new Set();
      try {
        const { view, hasScope } = await buildOnce(forSeed);
        // Started with another seed meanwhile: its own rebuild follows.
        if (seed !== forSeed) continue;
        const left = new Set(current.authors);
        for (const author of view.authors) if (!left.delete(author)) changed.add(author);
        for (const author of left) changed.add(author);
        current = view;
        viewError = null;
        if (hasScope || firstSyncSettled) markReady();
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
    void requestRebuild(change.scopes.map(({ author }) => author));
  });

  // A first sync that failed still makes the view ready, empty or not, rather than leaving requests waiting.
  runtime.onStatus((status) => {
    if (firstSyncSettled || status.seed !== seed || (status.lastSyncAt === null && status.lastError === null)) return;
    firstSyncSettled = true;
    void requestRebuild([]);
  });

  const status = (): RuntimeStatus => {
    const base = runtime.status();
    return viewError === null || base.state === 'stopped' ? base : { ...base, state: 'error', lastError: viewError };
  };

  return {
    start(next) {
      if (seed !== null && seed !== next) {
        current = empty;
        routed = null;
        ensuredUsers.clear();
        ensuredPosts.clear();
        cache.clear();
        readyPromise = new Promise<void>((resolve) => {
          markReady = resolve;
        });
      }
      if (seed !== next) firstSyncSettled = false;
      seed = next;
      runtime.start(next);
      // The store may hold a previous session's scope, served before any network.
      void requestRebuild([]);
    },
    stop: () => runtime.stop(),
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
    async request(request) {
      await readyPromise;
      const forSeed = seed;
      if (forSeed === null) throw new IndexerError('the indexer is not started');
      if (routed === null || routed.view !== current) {
        routed = { view: current, router: createNexusRouter(createSocialQueries(current, { seed: forSeed, now })) };
      }
      return routed.router.route(request);
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
