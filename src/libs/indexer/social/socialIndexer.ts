import type { LeafRequest } from '../crawler.types';
import { CURSOR_ZERO } from '../cursor';
import { createIndexerRuntime } from '../indexer';
import { IndexerNotStartedError } from '../indexer.errors';
import type { Coverage, Cursor, Entry, MergedRuns, RecordEntry } from '../indexer.types';
import type { Coordination, RuntimeOptions, RuntimeStatus, Schedule } from '../runtime.types';
import { scopeId } from '../store.helpers';
import type { IndexStore, ScopeKey } from '../store.types';
import type { TimeSample } from '../timeTable';
import type { IndexerTransport } from '../transport.types';
import { createNexusRouter, type NexusRequest, type NexusResponse, type NexusRouter } from './nexusRouter';
import { createSocialQueries } from './queries/socialQueries';
import { createSocialDomain, SOCIAL_ACTIVITY, SOCIAL_GRAPH, type SocialDomain } from './social.domain';
import type { AuthorRecords, GroupHistory, Membership, SocialData, SocialTree } from './social.types';
import { findViewMismatch, ViewMismatchError } from './social.verify';
import {
  buildSocialState,
  buildSocialView,
  type Clocks,
  type SocialState,
  type SocialView,
  updateSocialState,
} from './social.view';

/**
 * What one tab keeps loaded on demand. Past a limit the least recently ensured item leaves the view and its scopes
 * leave the store.
 */
export interface SocialLimits {
  /** Users loaded with `ensureUser`. */
  maxVisitedUsers: number;
  /** Posts loaded with `ensurePost`. */
  maxLoosePosts: number;
  /** Profiles loaded with `ensureProfile`. */
  maxProfiles: number;
  /** File records loaded with `ensureFile`. */
  maxFiles: number;
}

export const DEFAULT_SOCIAL_LIMITS: Readonly<SocialLimits> = Object.freeze({
  maxVisitedUsers: 50,
  maxLoosePosts: 500,
  maxProfiles: 500,
  maxFiles: 500,
});

export interface SocialViewOptions {
  /**
   * Also builds the view from scratch after each update and fails with `ViewMismatchError` on any difference, for
   * tests: it costs a full build per change. The error stays in `status()` and rejects requests from then on.
   */
  verifyView: boolean;
}

export interface SocialIndexerParams {
  transport: IndexerTransport;
  store: IndexStore<SocialData>;
  /** Wall clock in ms. */
  now: () => number;
  schedule?: Schedule;
  /** Its owner closes it: the indexer never does. */
  coordination?: Coordination | null;
  options?: Partial<RuntimeOptions & SocialLimits & SocialViewOptions>;
  /**
   * An older tree to read as well, for the authors who have not moved to social v1: each author is read through one
   * tree (`SocialDomain.treeOf`). Off without it.
   */
  legacyTree?: SocialTree;
}

/** What changed, for narrow invalidation: follows, posts and tags, or profiles. */
export type SocialChangeKind = 'graph' | 'activity' | 'profile';

const KIND_ORDER: readonly SocialChangeKind[] = ['graph', 'activity', 'profile'];

export interface SocialChange {
  /** Authors whose records or membership changed, or who entered or left the view. */
  authors: string[];
  /** Whether the scope's members changed: answers about the scope may all differ. */
  membersChanged: boolean;
  /**
   * `graph` when an author's follows changed, `activity` when posts or tags did, `profile` when a profile did. A change
   * of members brings `graph` and `activity`.
   */
  kinds: SocialChangeKind[];
}

/** What one `backfill` call did, read from the view once it holds the step. */
export interface BackfillOutcome {
  /**
   * `skipped` when the rate limit left the call out (`backfillMinIntervalMs`), reading nothing; `ran` otherwise, the
   * step shared with a call still running for the same author and group included.
   */
  status: 'ran' | 'skipped';
  /** Whether the author's history of the group now reaches the start of their stream. */
  complete: boolean;
  /** Stream events the step added. */
  events: number;
  /** Posts of the author the view holds now and did not when the call was made. */
  posts: number;
  /** The estimated time from which the history is loaded, `null` when complete or unknown. */
  sinceMs: number | null;
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
   * Loads one post with its whole history and keeps it resolvable by key, for a post the scope does not hold, with
   * its author's profile when the view has none, both at once. Its author joins no stream, ranking or count. Resolves
   * once the view holds the post; the posts it replies to or quotes start loading then, with their authors' profiles.
   */
  ensurePost(author: string, postId: string): Promise<void>;
  /** Loads only the user's profile, for an avatar or a name; a user the view lacks joins it as `referenced`. */
  ensureProfile(user: string): Promise<void>;
  /**
   * Loads the file record at the path of the author's tree, for a post's attachment outside the window. Resolves at
   * once when no tree read keeps a record there.
   */
  ensureFile(author: string, path: string): Promise<void>;
  /**
   * Leaves these users out of the view's members now, and of the scope from the next sync on, with whoever is reached
   * only through them.
   */
  setExcluded(users: Iterable<string>): void;
  /**
   * Loads up to `pages` pages of the author's older history of the group, `SOCIAL_GRAPH` or `SOCIAL_ACTIVITY` whatever
   * trees are read. Rate limited per author and group unless
   * `force` (`backfillMinIntervalMs`). Resolves once the view holds the step, at once when the step committed
   * nothing; rejects when the step fails.
   */
  backfill(author: string, group: string, pages: number, options?: { force?: boolean }): Promise<BackfillOutcome>;
  /** An empty view until the first build. */
  view(): SocialView;
  /**
   * Resolves once a view holds the seed's own scopes: from the store, from a loaded index file, or after the first
   * sync committed the seed's graph (its activity follows, answers saying `syncing`), whichever comes first. A seed whose homeserver does not resolve or cannot be read
   * makes it resolve once that attempt is over, with `status().stats.seed` saying which.
   */
  ready(): Promise<void>;
  /**
   * Resolves the first time answers say `syncing: false`: the first scope sync of this run has settled, failed
   * included, the files it left for later are fetched, and the view holds all of it. A visitor's resolves once the
   * files the store lacked are fetched.
   */
  whenSynced(): Promise<void>;
  /** Answers once `ready`; rejects with `IndexerNotStartedError` before `start` or after `stop`. */
  request(request: NexusRequest): Promise<NexusResponse>;
  /** Called after each view rebuild that changed something. */
  onChange(listener: (change: SocialChange) => void): () => void;
  status(): RuntimeStatus;
  onStatus(listener: (status: RuntimeStatus) => void): () => void;
}

const V1_DOMAIN = createSocialDomain();

/** The leaf scope holding a user's profile alone, with social v1 alone. */
export const profileLeaf = (user: string): LeafRequest => V1_DOMAIN.profileLeaf(user);

/** Moves `key` to the most recent end and returns the values pushed out past `max`, least recent first. */
function touch<V>(items: Map<string, V>, key: string, value: V, max: number): V[] {
  items.delete(key);
  items.set(key, value);
  const out: V[] = [];
  for (const [old, item] of items) {
    if (items.size <= max || old === key) break;
    items.delete(old);
    out.push(item);
  }
  return out;
}

/** The leaf scope holding every version of one post, with social v1 alone. */
export const postLeaf = (author: string, postId: string): LeafRequest => V1_DOMAIN.postLeaf(author, postId);

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
function deletedPosts(tree: SocialTree, author: string, scopes: readonly MergedRuns<SocialData>[]): Set<string> {
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
    const key = tree.keyOf(author, path);
    if (key === null || key.kind !== 'post') continue;
    verdicts.set(key.postId, (verdicts.get(key.postId) ?? true) && proof);
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

/** What an author's records are made of: the same inputs make the same records. */
const inputsOf = ({ homeserver, membership, hop, graph, activity, leaves }: Loaded): readonly unknown[] => [
  homeserver,
  membership,
  hop,
  graph,
  activity,
  ...leaves,
];

const sameInputs = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((input, i) => input === b[i]);

/** The records the tree owns, the same map when it is the only tree read. */
function ownRecords(
  domain: SocialDomain,
  tree: SocialTree,
  records: ReadonlyMap<string, RecordEntry<SocialData>>,
): ReadonlyMap<string, RecordEntry<SocialData>> {
  return domain.trees.length === 1 ? records : new Map([...records].filter(([path]) => tree.owns(path)));
}

function authorRecords(domain: SocialDomain, author: string, loaded: Loaded): AuthorRecords {
  const { homeserver, membership, hop, graph, activity, leaves } = loaded;
  const tree = domain.treeOf([graph.entries, activity.entries, ...leaves.map(({ entries }) => entries)]);
  const loose = new Map<string, RecordEntry<SocialData>>();
  for (const leaf of leaves) {
    for (const [path, record] of leaf.live) {
      const stored = activity.entries.get(path);
      if (stored === undefined || record.cursor > stored.cursor) loose.set(path, record);
    }
  }
  const profile = graph.entries.get(tree.profilePath);
  const records: AuthorRecords = {
    author,
    homeserver,
    membership,
    hop,
    graph: ownRecords(domain, tree, graph.live),
    activity: ownRecords(domain, tree, activity.live),
    loose: ownRecords(domain, tree, loose),
    deleted: {
      posts: deletedPosts(tree, author, [activity, ...leaves]),
      profile: profile !== undefined && profile.kind === 'tombstone' && isTrusted(graph, profile),
    },
    history: { graph: historyOf(graph), activity: historyOf(activity) },
  };
  if (domain.trees.length > 1) records.tree = tree;
  return records;
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The kinds of a change from `before` to `after` for these authors; follows and profiles are compared. */
function kindsOf(
  before: SocialView,
  after: SocialView,
  authors: ReadonlySet<string>,
  activity: boolean,
  membersChanged: boolean,
): SocialChangeKind[] {
  const kinds = new Set<SocialChangeKind>(activity ? ['activity'] : []);
  if (membersChanged) kinds.add('graph');
  for (const author of authors) {
    if (!sameList(before.following(author), after.following(author))) kinds.add('graph');
    if (JSON.stringify(before.profile(author)) !== JSON.stringify(after.profile(author))) kinds.add('profile');
  }
  return KIND_ORDER.filter((kind) => kinds.has(kind));
}

/** Each user's membership, so that a change of it alone counts as a change of the user. */
const membershipsOf = (loaded: ReadonlyMap<string, Loaded>) =>
  new Map([...loaded].map(([author, { membership }]): [string, Membership] => [author, membership]));

export function createSocialIndexer(params: SocialIndexerParams): SocialIndexer {
  const { store, now } = params;
  const limits: SocialLimits = { ...DEFAULT_SOCIAL_LIMITS, ...params.options };
  const domain = createSocialDomain(params.legacyTree);
  const { graphGroup, activityGroup, profileGroup } = domain;
  const runtime = createIndexerRuntime({ ...params, domain });
  const verifyView = params.options?.verifyView ?? false;
  const emptyState = buildSocialState([]);
  const empty = emptyState.view;

  let seed: string | null = null;
  let started = false;
  /** Bumped by each start, so a rebuild begun for an earlier one is dropped. */
  let generation = 0;
  let state = emptyState;
  let current = empty;
  /**
   * Each author's records with what they were made of. Reused while the inputs are the same objects, which lets the
   * view update only the authors whose records changed.
   */
  const built = new Map<string, { inputs: readonly unknown[]; records: AuthorRecords }>();
  /** A failed verification is a bug: it is never cleared. */
  let mismatch: ViewMismatchError | null = null;
  let currentMemberships = new Map<string, Membership>();
  let routed: { view: SocialView; syncing: boolean; router: NexusRouter } | null = null;
  let viewError: Error | null = null;
  let firstSyncSettled = false;
  /** Whether the runtime had nothing left to bring while the current view was built. */
  let viewComplete = false;
  /** Whether the runtime had nothing left to bring at its last status, and how often it got there. */
  let runtimeComplete = false;
  let completions = 0;
  /** What was loaded on demand, least recently ensured first. */
  const ensuredUsers = new Map<string, string>();
  const ensuredPosts = new Map<string, LeafRequest>();
  const ensuredProfiles = new Map<string, LeafRequest>();
  const ensuredFiles = new Map<string, LeafRequest>();
  /** Scopes another tab, or this one, forgot: what still has none drops out of the ensured items. */
  let pendingForgotten: ScopeKey[] = [];
  /** Merged scopes by scope id, with the scope's change count when read. */
  const cache = new Map<string, { merged: MergedRuns<SocialData>; changes: number }>();
  /** Per scope id, the changes reported for it: data filled in at a stored cursor leaves the coverage as it was. */
  const changeCounts = new Map<string, number>();
  let pendingAuthors = new Set<string>();
  /** Whether posts or tags changed since the last rebuild. */
  let pendingActivity = false;
  let excluded: ReadonlySet<string> = new Set(params.options?.crawler?.excluded ?? []);
  let rebuilding: Promise<void> | null = null;
  let again = false;
  /** Rebuilds started so far, and the callers waiting for the one numbered `after` or a later one to end. */
  let builds = 0;
  let waiting: Array<{ after: number; resolve: () => void }> = [];
  const endBuild = (number: number) => {
    const done = waiting.filter(({ after }) => after <= number);
    waiting = waiting.filter(({ after }) => after > number);
    for (const { resolve } of done) resolve();
  };
  const listeners = new Set<(change: SocialChange) => void>();

  /** Nothing the answers depend on is still to come: the first sync settled and no file is pending. */
  const isComplete = (status: RuntimeStatus) => firstSyncSettled && !status.bodiesPending;

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
    const graph = await served({ author, homeserver, group: graphGroup });
    const activity = membership === 'referenced' ? NOTHING : await served({ author, homeserver, group: activityGroup });
    loaded.set(author, { homeserver, membership, hop, graph, activity, leaves: [] });
  }

  /** Adds each ensured post's or file's leaf scope to its author, who is referenced when not loaded otherwise. */
  async function addLeaves(loaded: Map<string, Loaded>): Promise<void> {
    for (const leaf of [...ensuredPosts.values(), ...ensuredFiles.values()]) {
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

  /** Uses an ensured profile over the stored one of an author the view holds only as referenced, when newer. */
  async function addProfiles(loaded: Map<string, Loaded>): Promise<void> {
    for (const leaf of ensuredProfiles.values()) {
      const homeserver = await homeserverOf(leaf.author);
      if (homeserver === null) continue;
      const scope = await served({ author: leaf.author, homeserver, group: leaf.group });
      if (scope.coverage.length === 0) continue;
      await load(loaded, leaf.author, 'referenced', null);
      const target = loaded.get(leaf.author);
      if (target === undefined || target.membership !== 'referenced' || target.homeserver !== homeserver) continue;
      const stored = target.graph.entries.get(domain.treeOf([target.graph.entries]).profilePath);
      const fresh = scope.entries.get(domain.treeOf([scope.entries]).profilePath);
      if (fresh !== undefined && (stored === undefined || fresh.cursor > stored.cursor)) target.graph = scope;
    }
  }

  async function dropForgotten(): Promise<void> {
    const forgotten = pendingForgotten;
    pendingForgotten = [];
    for (const scope of forgotten) {
      // An activity scope may stay empty for a user who is loaded; the graph says.
      if (scope.group === activityGroup || (await store.readCoverage(scope)).length > 0) continue;
      if (scope.group === graphGroup) ensuredUsers.delete(scope.author);
      else if (scope.group === profileGroup) ensuredProfiles.delete(scope.author);
      else {
        const key = JSON.stringify([scope.author, scope.group]);
        ensuredPosts.delete(key);
        ensuredFiles.delete(key);
      }
    }
  }

  /**
   * Drops the members no longer reached from the seed without passing through an excluded user, as the next scope
   * sync will.
   */
  function pruneExcluded(loaded: Map<string, Loaded>, forSeed: string): void {
    const reached = new Set([forSeed]);
    for (let frontier = [forSeed]; frontier.length > 0;) {
      const next: string[] = [];
      for (const user of frontier) {
        const graph = loaded.get(user)?.graph;
        for (const link of graph === undefined ? [] : domain.linksOf(graph.live, graph.entries)) {
          if (reached.has(link) || excluded.has(link) || loaded.get(link)?.membership !== 'member') continue;
          reached.add(link);
          next.push(link);
        }
      }
      frontier = next;
    }
    for (const [author, { membership }] of loaded) {
      if (membership === 'member' && !reached.has(author)) loaded.delete(author);
    }
  }

  /** The author's records, the same object as last time when made of the same inputs. */
  function recordsOf(author: string, loaded: Loaded): AuthorRecords {
    const inputs = inputsOf(loaded);
    const known = built.get(author);
    if (known !== undefined && sameInputs(known.inputs, inputs)) return known.records;
    const records = authorRecords(domain, author, loaded);
    built.set(author, { inputs, records });
    return records;
  }

  /** The view of the records, updated from the current state for the authors whose records changed. */
  function viewOf(records: readonly AuthorRecords[], clocks: Clocks): SocialState {
    const nowMs = now();
    const next = updateSocialState(state, records, clocks, nowMs);
    if (verifyView) {
      const difference = findViewMismatch(buildSocialView(records, clocks, nowMs), next.view, records);
      if (difference !== null) throw new ViewMismatchError(difference);
    }
    return next;
  }

  async function buildOnce(
    forSeed: string | null,
  ): Promise<{ next: SocialState; memberships: Map<string, Membership>; hasScope: boolean }> {
    const members = forSeed === null ? new Map<string, number>() : await store.readScopeMembers(forSeed);
    const hops = new Map<string, number>(members);
    if (forSeed !== null && !hops.has(forSeed)) hops.set(forSeed, 0);
    await dropForgotten();
    const loaded = new Map<string, Loaded>();
    for (const [author, hop] of hops) await load(loaded, author, 'member', hop);
    if (forSeed !== null && excluded.size > 0) pruneExcluded(loaded, forSeed);
    for (const user of ensuredUsers.keys()) if (!loaded.has(user)) await load(loaded, user, 'visited', null);
    await addLeaves(loaded);
    await addProfiles(loaded);
    for (const author of built.keys()) if (!loaded.has(author)) built.delete(author);
    const records = [...loaded].map(([author, entry]) => recordsOf(author, entry));
    const clocks = new Map<string, readonly TimeSample[]>();
    for (const { homeserver } of loaded.values()) {
      if (!clocks.has(homeserver)) clocks.set(homeserver, (await store.readHomeserverState(homeserver)).clock);
    }
    return { next: viewOf(records, clocks), memberships: membershipsOf(loaded), hasScope: members.size > 0 };
  }

  async function runRebuilds(): Promise<void> {
    do {
      again = false;
      const run = generation;
      const forSeed = seed;
      if (!started) break;
      builds += 1;
      const number = builds;
      const settled = firstSyncSettled;
      const completion = runtimeComplete ? completions : -1;
      const changed = pendingAuthors;
      const activity = pendingActivity;
      pendingAuthors = new Set();
      pendingActivity = false;
      try {
        const { next, memberships, hasScope } = await buildOnce(forSeed);
        const { view } = next;
        // Started again meanwhile: its own rebuild follows.
        if (generation !== run) continue;
        let membersChanged = false;
        for (const [author, membership] of memberships) {
          if (currentMemberships.get(author) === membership) continue;
          changed.add(author);
          membersChanged = membersChanged || membership === 'member' || currentMemberships.get(author) === 'member';
        }
        for (const [author, membership] of currentMemberships) {
          if (memberships.has(author)) continue;
          changed.add(author);
          membersChanged = membersChanged || membership === 'member';
        }
        const kinds = kindsOf(current, view, changed, activity || membersChanged, membersChanged);
        state = next;
        current = view;
        currentMemberships = memberships;
        viewError = null;
        // Complete only when nothing arrived since the build began: what did is in the view built next.
        viewComplete = runtimeComplete && completion === completions;
        if (hasScope || settled) markReady();
        if (viewComplete) markSynced();
        if (changed.size > 0) {
          const change: SocialChange = { authors: [...changed], membersChanged, kinds };
          for (const listener of listeners) listener(change);
        }
      } catch (error) {
        pendingActivity = pendingActivity || activity;
        viewError = asError(error);
        if (error instanceof ViewMismatchError) mismatch = error;
      } finally {
        endBuild(number);
      }
    } while (again);
    rebuilding = null;
    // Stopped: nothing more will be built for whoever still waits.
    endBuild(Number.POSITIVE_INFINITY);
  }

  /**
   * Resolves when a rebuild that started after this call has finished, not when rebuilds stop: changes that keep
   * coming, such as a fill's files, would otherwise hold a load's caller until they end.
   */
  function requestRebuild(authors: Iterable<string>): Promise<void> {
    for (const author of authors) pendingAuthors.add(author);
    const built = new Promise<void>((resolve) => {
      waiting.push({ after: builds + 1, resolve });
    });
    if (rebuilding !== null) again = true;
    else rebuilding = runRebuilds();
    return built;
  }

  runtime.onChange((change) => {
    pendingForgotten.push(...(change.forgotten ?? []));
    for (const scope of change.scopes) {
      const id = scopeId(scope);
      changeCounts.set(id, (changeCounts.get(id) ?? 0) + 1);
      if (scope.group !== graphGroup && scope.group !== profileGroup) pendingActivity = true;
    }
    void requestRebuild(change.scopes.map(({ author }) => author));
  });

  runtime.onStatus((status) => {
    if (status.state === 'stopped' || status.seed !== seed) return;
    // A first sync that failed still makes the view ready, empty or not, rather than leaving requests waiting.
    const firstSettles = !firstSyncSettled && !status.firstSyncPending;
    if (firstSettles) firstSyncSettled = true;
    const completes = !runtimeComplete && isComplete(status);
    runtimeComplete = isComplete(status);
    if (!runtimeComplete) viewComplete = false;
    if (completes) completions += 1;
    // The view built next holds everything the runtime brought.
    if (firstSettles || completes) void requestRebuild([]);
  });

  /** Waits for a load and for what it pushed out to be forgotten, then for the view. */
  function loadedThen(load: Promise<void>, forgetting: Promise<void> | null): Promise<void> {
    // A failed forget leaves only rows the view no longer reads.
    const forgotten = forgetting?.catch(() => undefined) ?? null;
    return Promise.all([load, forgotten]).then(() => requestRebuild([]));
  }

  /** The tail of the author's top contiguous coverage of the group in the store, `null` when none. */
  async function storedTail(author: string, group: string): Promise<Cursor | null> {
    const homeserver = await homeserverOf(author);
    if (homeserver === null) return null;
    const coverage = await store.readCoverage({ author, homeserver, group });
    return coverage.length === 0 ? null : coverage[coverage.length - 1].tail;
  }

  async function backfill(
    author: string,
    group: string,
    pages: number,
    options?: { force?: boolean },
  ): Promise<BackfillOutcome> {
    const before = new Set(current.postsBy(author).map(({ postId }) => postId));
    const stored = group === SOCIAL_ACTIVITY ? activityGroup : group === SOCIAL_GRAPH ? graphGroup : group;
    const step = await runtime.backfill(author, stored, pages, options);
    // Changes reach the view debounced; a rebuild of its own makes the step visible before this resolves.
    if (step !== null && step.pages > 0) await requestRebuild([]);
    const tail = step === null ? await storedTail(author, stored) : step.tail;
    const complete = tail === CURSOR_ZERO;
    return {
      status: step === null ? 'skipped' : 'ran',
      complete,
      events: step === null ? 0 : step.events,
      posts: current.postsBy(author).filter(({ postId }) => !before.has(postId)).length,
      sinceMs: complete || tail === null ? null : current.timeOf(author, tail),
    };
  }

  function ensureLeaf(items: Map<string, LeafRequest>, key: string, leaf: LeafRequest, max: number): Promise<void> {
    const known = items.has(key);
    const evicted = touch(items, key, leaf, max);
    if (!known || evicted.length > 0) void requestRebuild([]);
    return loadedThen(runtime.ensureLeaf(leaf), evicted.length === 0 ? null : runtime.forget({ leaves: evicted }));
  }

  function ensurePostAlone(author: string, postId: string): Promise<void> {
    const leaf = domain.postLeaf(author, postId);
    return ensureLeaf(ensuredPosts, JSON.stringify([author, leaf.group]), leaf, limits.maxLoosePosts);
  }

  function ensureProfile(user: string): Promise<void> {
    return ensureLeaf(ensuredProfiles, user, domain.profileLeaf(user), limits.maxProfiles);
  }

  function ensureFile(author: string, path: string): Promise<void> {
    const leaf = domain.fileLeaf(author, path);
    if (leaf === null) return Promise.resolve();
    return ensureLeaf(ensuredFiles, JSON.stringify([author, leaf.group]), leaf, limits.maxFiles);
  }

  /** Never rejects: the post loads without it. */
  function ensureProfileIfMissing(user: string): Promise<void> {
    return current.profile(user) === null ? ensureProfile(user).catch(() => undefined) : Promise.resolve();
  }

  /**
   * Loads a leaf nobody asked for yet, inside the same limit as the asked ones but never pushing one of them out: it
   * enters as the least recently ensured item, so it goes first, and is skipped while the limit is reached. Asking
   * for it later makes it the most recent like any other.
   */
  function prefetchLeaf(items: Map<string, LeafRequest>, key: string, leaf: LeafRequest, max: number): void {
    if (items.has(key) || items.size >= max) return;
    const rest = [...items];
    items.clear();
    items.set(key, leaf);
    for (const [known, item] of rest) items.set(known, item);
    void requestRebuild([]);
    void loadedThen(runtime.ensureLeaf(leaf), null).catch(() => undefined);
  }

  function prefetchReferences(author: string, postId: string): void {
    const post = current.post(author, postId);
    if (post === null) return;
    for (const target of [post.data.parent, post.data.embed]) {
      if (target === null || target.kind !== 'post' || current.post(target.author, target.postId) !== null) continue;
      const leaf = domain.postLeaf(target.author, target.postId);
      prefetchLeaf(ensuredPosts, JSON.stringify([target.author, leaf.group]), leaf, limits.maxLoosePosts);
      if (current.profile(target.author) === null) {
        prefetchLeaf(ensuredProfiles, target.author, domain.profileLeaf(target.author), limits.maxProfiles);
      }
    }
  }

  const status = (): RuntimeStatus => {
    const base = runtime.status();
    const error = mismatch ?? (base.state === 'stopped' ? null : viewError);
    return error === null ? base : { ...base, state: 'error', lastError: error };
  };

  return {
    start(next) {
      if (started && seed === next) return;
      if (generation > 0 && seed !== next) {
        state = emptyState;
        current = empty;
        currentMemberships = new Map();
        routed = null;
        ensuredUsers.clear();
        ensuredPosts.clear();
        ensuredProfiles.clear();
        ensuredFiles.clear();
        pendingForgotten = [];
        cache.clear();
        built.clear();
        readyPromise = new Promise<void>((resolve) => {
          markReady = resolve;
        });
      }
      // A visitor has no scope to sync.
      firstSyncSettled = next === null;
      viewComplete = false;
      runtimeComplete = false;
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
      const known = ensuredUsers.has(user);
      const evicted = touch(ensuredUsers, user, user, limits.maxVisitedUsers);
      if (!known || evicted.length > 0) void requestRebuild([]);
      return loadedThen(runtime.ensureUser(user), evicted.length === 0 ? null : runtime.forget({ users: evicted }));
    },
    ensurePost(author, postId) {
      const post = ensurePostAlone(author, postId);
      // A card needs its author's name and avatar: asked in the same turn, the two leaves load as one batch.
      const profile = ensureProfileIfMissing(author);
      // The thread and quote the page shows next, one level ahead and never awaited.
      void post.then(() => prefetchReferences(author, postId)).catch(() => undefined);
      return Promise.all([post, profile]).then(() => undefined);
    },
    ensureProfile,
    ensureFile,
    setExcluded(users) {
      excluded = new Set(users);
      runtime.setExcluded(excluded);
      void requestRebuild([]);
    },
    backfill,
    view: () => current,
    ready: () => readyPromise,
    whenSynced: () => syncedPromise,
    async request(request) {
      if (!started) throw new IndexerNotStartedError();
      await readyPromise;
      if (!started) throw new IndexerNotStartedError();
      if (mismatch !== null) throw mismatch;
      const syncing = !viewComplete || !isComplete(runtime.status());
      if (routed === null || routed.view !== current || routed.syncing !== syncing) {
        const queries = createSocialQueries(current, { seed, now, syncing });
        routed = { view: current, syncing, router: createNexusRouter(queries) };
      }
      return { ...(await routed.router.route(request)), syncing, asOf: runtime.status().asOf };
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
