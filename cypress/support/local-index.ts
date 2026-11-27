import { expectTimelineContains } from './feeds';
import { goToHomePage, goToSettingsPage, openSettingsSection } from './header';
import { waitForFeedToLoad } from './posts';
import {
  createImagePostViaApi,
  createPostViaApi,
  deletePostViaApi,
  editPostViaApi,
  followUserViaApi,
  replyViaApi,
  repostViaApi,
  seedUserViaApi,
  tagPostViaApi,
} from './seed';
import { PostType } from './types/enums';
import type { SeededPost, SeededUser } from './types/seed';

// Helpers for the specs under e2e/local-index, which run against an app started with
// PUBKY_RUNTIME_INDEXER_SOURCES=local and no Nexus or CDN URL (the e2e workflow's `indexer_sources: local`
// dispatch, see docs/development-workflow.md). The app then builds its index in the browser from the
// signed-in user's network on the homeservers. The seed tasks still tell Nexus about each new user;
// that is the harness talking to Nexus from Node, which the guard below neither sees nor forbids.

// Where the app points a Nexus URL built without a configured one; it never resolves
const UNCONFIGURED_NEXUS_ORIGIN = 'https://nexus.invalid';

// The first sync reads a handful of users from the stack's own homeserver: seconds, with room for a slow runner
export const FIRST_SYNC_TIMEOUT = { timeout: 60_000 };

const forbiddenOrigins = (): string[] => [
  ...new Set(
    [Cypress.expose('nexusUrl'), Cypress.expose('cdnUrl'), UNCONFIGURED_NEXUS_ORIGIN].map(
      (url) => new URL(String(url)).origin,
    ),
  ),
];

/**
 * Fails the test on any browser request to Nexus, its CDN or the placeholder origin. Call it first in a
 * `describe`, so its `before` also covers the visits of the spec's own `before`.
 */
export const forbidNexusRequests = () => {
  const made: string[] = [];
  const install = () => {
    made.length = 0;
    forbiddenOrigins().forEach((origin) => {
      cy.intercept({ url: new RegExp(`^${Cypress._.escapeRegExp(origin)}/`) }, (req) => {
        made.push(`${req.method} ${req.url}`);
        throw new Error(`the app requested ${req.method} ${req.url} while it runs without Nexus`);
      });
    });
  };
  before(install);
  beforeEach(install);
  // Also catches a request the handler's error could not fail the test with
  afterEach(() => {
    cy.then(() => {
      expect(made, 'requests to Nexus or its CDN').to.deep.equal([]);
    });
  });
};

type InjectedConfig = { indexerSources?: string[]; nexusUrl?: string; cdnUrl?: string; indexerWindowMs?: number };

/** The page's runtime config says the app reads from its local index alone, with no Nexus or CDN origin. */
export const expectAppWithoutNexus = () => {
  cy.window().should((win) => {
    const config = Reflect.get(win, '__PUBKY_CONFIG__') as InjectedConfig | undefined;
    expect(config, 'runtime config').to.not.equal(undefined);
    expect(config?.indexerSources, 'indexer sources').to.deep.equal(['local']);
    expect(config?.nexusUrl, 'Nexus URL').to.equal(undefined);
    expect(config?.cdnUrl, 'CDN URL').to.equal(undefined);
  });
};

const runId = Date.now().toString();

export const NETWORK_NAMES = {
  viewer: 'Local Viewer',
  alice: 'Local Alice',
  bob: 'Local Bob',
  carol: 'Local Carol',
  olga: 'Local Olga',
} as const;

// No text is a substring of another, so a search for one never matches a second post
export const NETWORK_TEXTS = {
  viewerRoot: `local ${runId} viewer root`,
  aliceBeforeEdit: `local ${runId} alice before the edit`,
  aliceAfterEdit: `local ${runId} alice after the edit`,
  aliceDeleted: `local ${runId} alice deleted`,
  aliceImage: `local ${runId} alice image`,
  aliceTagged: `local ${runId} alice tagged`,
  bobNote: `local ${runId} bob note`,
  carolNote: `local ${runId} carol two hops out`,
  olgaNote: `local ${runId} olga outside the network`,
  aliceReply: `local ${runId} alice replies to the viewer`,
  bobReply: `local ${runId} bob replies to alice`,
  olgaReply: `local ${runId} olga replies to the viewer`,
  bobRepost: `local ${runId} bob quotes alice`,
} as const;

/** Given by Alice and Bob to Alice's tagged post, so its chip counts two. */
export const NETWORK_TAG = 'localnet';

type UserKey = keyof typeof NETWORK_NAMES;
type PostKey =
  | 'viewerRoot'
  | 'aliceEdited'
  | 'aliceDeleted'
  | 'aliceImage'
  | 'aliceTagged'
  | 'bobNote'
  | 'carolNote'
  | 'olgaNote'
  | 'aliceReply'
  | 'bobReply'
  | 'olgaReply'
  | 'bobRepost';

/**
 * Wider than the `feed` variant (2304 x 800 px), so the worker's resized copy shows in the served image. The app's own
 * landing image, reused rather than copied into the fixtures.
 */
const LARGE_IMAGE_FIXTURE = '../../public/images/landing-experience1.png';

export type LocalNetwork = Record<UserKey, SeededUser> & { posts: Record<PostKey, SeededPost> };

/**
 * Seeds the viewer's network: the viewer follows Alice and Bob, Bob follows back, Alice follows Carol (two hops
 * out), and nobody follows Olga. Alice edits one post and deletes another, Alice and Bob tag a third, Alice and
 * Bob reply in a chain under the viewer's post, Olga replies there too, and Bob quotes Alice. Every user gets a
 * profile first, since the index skips users without one. Root posts are written oldest first in this order:
 * viewer, Alice (edited, deleted, image, tagged), Bob, Carol, Olga, then Bob's quote.
 */
export const seedLocalNetwork = (): Cypress.Chainable<LocalNetwork> => {
  const users = {} as Record<UserKey, SeededUser>;
  const posts = {} as Record<PostKey, SeededPost>;
  const keep = (key: PostKey) => (post: SeededPost) => {
    posts[key] = post;
  };

  (Object.keys(NETWORK_NAMES) as UserKey[]).forEach((key) => {
    seedUserViaApi(NETWORK_NAMES[key], { bio: `Seeded for the local index (${key})` }).then((user) => {
      users[key] = user;
    });
  });

  cy.then(() => {
    createPostViaApi(users.viewer, NETWORK_TEXTS.viewerRoot).then(keep('viewerRoot'));
    createPostViaApi(users.alice, NETWORK_TEXTS.aliceBeforeEdit).then(keep('aliceEdited'));
    createPostViaApi(users.alice, NETWORK_TEXTS.aliceDeleted).then(keep('aliceDeleted'));
    createImagePostViaApi(users.alice, NETWORK_TEXTS.aliceImage, { fixture: LARGE_IMAGE_FIXTURE }).then(
      keep('aliceImage'),
    );
    createPostViaApi(users.alice, NETWORK_TEXTS.aliceTagged).then(keep('aliceTagged'));
    createPostViaApi(users.bob, NETWORK_TEXTS.bobNote).then(keep('bobNote'));
    createPostViaApi(users.carol, NETWORK_TEXTS.carolNote).then(keep('carolNote'));
    createPostViaApi(users.olga, NETWORK_TEXTS.olgaNote).then(keep('olgaNote'));
  });
  cy.then(() => {
    replyViaApi(users.alice, posts.viewerRoot, NETWORK_TEXTS.aliceReply).then(keep('aliceReply'));
    replyViaApi(users.olga, posts.viewerRoot, NETWORK_TEXTS.olgaReply).then(keep('olgaReply'));
  });
  cy.then(() => {
    replyViaApi(users.bob, posts.aliceReply, NETWORK_TEXTS.bobReply).then(keep('bobReply'));
    repostViaApi(users.bob, posts.aliceTagged, NETWORK_TEXTS.bobRepost).then(keep('bobRepost'));

    followUserViaApi(users.viewer, users.alice);
    followUserViaApi(users.viewer, users.bob);
    followUserViaApi(users.bob, users.viewer);
    followUserViaApi(users.alice, users.carol);

    tagPostViaApi(users.alice, posts.aliceTagged, [NETWORK_TAG]);
    tagPostViaApi(users.bob, posts.aliceTagged, [NETWORK_TAG]);

    editPostViaApi(users.alice, posts.aliceEdited, NETWORK_TEXTS.aliceAfterEdit);
    deletePostViaApi(users.alice, posts.aliceDeleted);
  });

  return cy.then((): LocalNetwork => ({ ...users, posts }));
};

/**
 * How far back the app's index loads recent activity (`PUBKY_RUNTIME_INDEXER_WINDOW_MS`), which the e2e workflow sets
 * for the history spec alone.
 */
export const localIndexWindowMs = (): Cypress.Chainable<number> =>
  cy.window().then((win) => {
    const config = Reflect.get(win, '__PUBKY_CONFIG__') as InjectedConfig | undefined;
    expect(config?.indexerWindowMs, 'local index window (PUBKY_RUNTIME_INDEXER_WINDOW_MS)').to.be.a('number');
    return Number(config?.indexerWindowMs);
  });

export const HISTORY_NAMES = { viewer: 'History Viewer', author: 'History Author' } as const;

/** Starts every post text the history spec seeds. */
export const HISTORY_PREFIX = `history ${runId}`;

// More events than one step of older history reads (100), so the oldest posts lie past the step that opening the
// profile loads
const HISTORY_GAP_TAGS = 110;
// A full first page and two more
const HISTORY_RECENT_POSTS = 12;
// Room for the seed process's clock and the browser's to disagree
const WINDOW_MARGIN_MS = 5_000;

const historyText = (label: string) => `${HISTORY_PREFIX} ${label}`;

export type HistoryNetwork = Record<keyof typeof HISTORY_NAMES, SeededUser> & {
  /** The author's post texts, newest first. */
  texts: string[];
};

/**
 * Seeds an author the viewer follows, with posts on both sides of the index's window: two oldest posts, more tags
 * than a step of older history reads, the newest post older than the window, then, once that has aged past the
 * window, a full page of recent posts and two more. The index's sync then loads the recent posts, opening the
 * profile loads one step of older history (the edge post and tags), and only a scroll past the edge reaches the
 * two oldest.
 */
export const seedOlderHistory = (windowMs: number): Cypress.Chainable<HistoryNetwork> => {
  const users = {} as Record<keyof typeof HISTORY_NAMES, SeededUser>;
  const recent = Cypress._.times(HISTORY_RECENT_POSTS, (index) =>
    historyText(`recent ${String(index + 1).padStart(2, '0')}`),
  );
  const older = [historyText('oldest'), historyText('older')];
  const edge = historyText('edge');

  (Object.keys(HISTORY_NAMES) as Array<keyof typeof HISTORY_NAMES>).forEach((key) => {
    seedUserViaApi(HISTORY_NAMES[key], { bio: `Seeded for the local index history (${key})` }).then((user) => {
      users[key] = user;
    });
  });
  cy.then(() => {
    followUserViaApi(users.viewer, users.author);
    createPostViaApi(users.author, older[0]).then((oldest) => {
      createPostViaApi(users.author, older[1]);
      tagPostViaApi(
        users.author,
        oldest,
        Cypress._.times(HISTORY_GAP_TAGS, (index) => `gap${String(index).padStart(3, '0')}`),
      );
      createPostViaApi(users.author, edge);
    });
  });
  logPhase('waiting for the older posts to age past the window', `(${windowMs} ms)`);
  cy.wait(windowMs + WINDOW_MARGIN_MS);
  cy.then(() => {
    recent.forEach((text) => createPostViaApi(users.author, text));
  });

  return cy.then((): HistoryNetwork => ({ ...users, texts: [...recent].reverse().concat(edge, older[1], older[0]) }));
};

const PHASE_LOG_NAME = '[local-index]';
let lastPhaseAt: number | null = null;

/**
 * Prints a wall-clock phase mark in the run's log, with the time since the previous mark, so a slow run says where its
 * seconds went. `detail` is appended as is.
 */
export const logPhase = (label: string, detail = '') => {
  cy.then(() => {
    const now = Date.now();
    const since = lastPhaseAt === null ? '' : ` (+${((now - lastPhaseAt) / 1000).toFixed(1)}s)`;
    lastPhaseAt = now;
    const test = `${Cypress.spec.name} "${Cypress.currentTest?.title ?? ''}"`;
    const line = `${PHASE_LOG_NAME} ${new Date(now).toISOString()}${since} ${test}: ${label}${detail ? ` ${detail}` : ''}`;
    cy.task('log', line, { log: false });
  });
};

const APP_MARK_PREFIX = 'pubky:';

/**
 * Prints the app's own phase marks (`markPhase`, User Timing entries named `pubky:*`) left since `sinceMs`, each at its
 * own wall-clock time and its offset from then: the sign-in steps the page shows no sign of, such as the index being
 * ready or the bootstrap done.
 */
export const logAppMarks = (sinceLabel: string, sinceMs: number) => {
  cy.window({ log: false }).then((win) => {
    const marks = win.performance
      .getEntriesByType('mark')
      .filter(({ name }) => name.startsWith(APP_MARK_PREFIX))
      .map(({ name, startTime }) => ({
        name: name.slice(APP_MARK_PREFIX.length),
        at: win.performance.timeOrigin + startTime,
      }))
      .filter(({ at }) => at >= sinceMs)
      .sort((a, b) => a.at - b.at);
    const test = `${Cypress.spec.name} "${Cypress.currentTest?.title ?? ''}"`;
    marks.forEach(({ name, at }) => {
      const offset = ((at - sinceMs) / 1000).toFixed(1);
      const line = `${PHASE_LOG_NAME} ${new Date(at).toISOString()} (${offset}s after ${sinceLabel}) ${test}: app ${name}`;
      cy.task('log', line, { log: false });
    });
  });
};

/** The status card as `label=value` pairs, for a phase mark. */
const localIndexStats = () =>
  cy
    .get('[data-testid="local-index-stats"]')
    .filter(':visible')
    .children()
    .then(($rows) =>
      $rows
        .toArray()
        .map((row) => Array.from(row.querySelectorAll('span'), (span) => span.textContent ?? '').join('='))
        .join(', '),
    );

// The status card's value next to `label`, e.g. 'First sync' or 'Users at hop 1'
export const localIndexStat = (label: string, options: Partial<Cypress.Timeoutable> = {}) =>
  cy
    .get('[data-testid="local-index-stats"]', options)
    .filter(':visible')
    .contains('span', new RegExp(`^${Cypress._.escapeRegExp(label)}$`), options)
    .next(options);

/** Opens Settings > Privacy and Safety, where the "Your network" card shows the local index's status. */
export const openLocalIndexStatus = () => {
  goToSettingsPage();
  openSettingsSection('privacySafety');
  cy.location('pathname').should('eq', '/settings/privacy-safety');
  cy.contains('h2', 'Your network').should('be.visible');
  cy.get('[data-testid="local-index-stats"]').filter(':visible').should('have.length', 1);
};

/**
 * Signs in as `user`, waits on the status card for the first sync of their network, then opens Home. Opening
 * Home after the sync loads every feed from the finished index, so a test asserts on the whole network at once.
 */
export const signInToLocalIndex = (user: SeededUser) => {
  let signingInAt = 0;
  cy.then(() => {
    signingInAt = Date.now();
  });
  logPhase('signing in');
  // A first sign-in of a key stops on the migration gate; a later one passes it unasked
  cy.signInWithPubkyRing(user.name, '/home', { beforeContinue: () => logPhase('gate shown') });
  logPhase('signed in, on Home');
  openLocalIndexStatus();
  localIndexStat('First sync', FIRST_SYNC_TIMEOUT).should('have.text', 'Done');
  localIndexStats().then((stats) => logPhase('first sync done', `{${stats}}`));
  // Read once the sync is done, so its own mark is among them; client navigation keeps the page's marks
  cy.then(() => logAppMarks('signing in', signingInAt));
  goToHomePage();
  logPhase('Home loaded');
};

/** Opens a post's page from its own card in the timeline, not from a card that quotes it. */
export const openPostFromTimeline = (text: string) => {
  expectTimelineContains(text);
  cy.findFirstPostInFeedFilteredByType(text, PostType.Post).find('[data-cy="post-text"]').contains(text).click();
  cy.location('pathname').should('match', /^\/post\//);
  cy.get('[data-cy="single-post-card"]').filter(':visible').should('contain.text', text);
};

const HOME_REVISITS = 10;

/**
 * Leaves Home and comes back until `check` holds for its timeline. A mounted feed keeps its posts when the index
 * changes, and a reload keeps the cached stream; a feed loaded again after the change rebuilds from the index.
 */
export const revisitHomeUntil = (description: string, check: (timelineText: string) => boolean, revisits = 0) => {
  waitForFeedToLoad();
  cy.get('body').then(($body) => {
    const timelineText = $body.find('[data-cy="timeline-container"] [data-cy="post-card"]').text();
    if (check(timelineText)) return;
    if (revisits >= HOME_REVISITS) {
      throw new Error(`Home still does not show ${description} after ${HOME_REVISITS} visits`);
    }
    goToSettingsPage();
    goToHomePage();
    revisitHomeUntil(description, check, revisits + 1);
  });
};
