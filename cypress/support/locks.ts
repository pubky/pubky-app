/**
 * Locks spec helpers: the stand-in Lock Server and the composer / reader steps.
 *
 * The app talks to the Lock Server through `src/core/services/locks/locks.e2eStub.ts` when
 * `PUBKY_RUNTIME_E2E_LOCKS_STUB_URL` is set (the Locks CI job only). That client sends every Lock
 * Server call as a `POST <stub>/e2e/<operation>` and the routes below answer them. Nothing else is
 * intercepted: the homeserver writes (guarded bytes, `lock.json`, the announcement, the reader's
 * purchase file and replica) and every Nexus read stay real.
 */
import type { CyHttpMessages } from 'cypress/types/net-stubbing';
import { userIdFromPubky } from './common';
import { logLocksStub, redactLocksStubUrl, shortPubky } from './locks-log';
import { isMobile } from './mobile';
import { postIdFromWriteUrl } from './nexus';
import { CheckForNewPosts, WaitForNewPosts } from './types/enums';

/** Same value as `PUBKY_RUNTIME_E2E_LOCKS_STUB_URL` in the e2e workflow; the host never resolves. */
export const locksStubUrl = (): string => String(Cypress.expose('locksStubUrl'));

const GUARDED_CONTENT_PATH = '/priv/app.locks/content/';
const AUTH_MESSAGE_TYPE = 'locks-auth-callback';
const AUTH_CODE = 'e2e-locks-code';
const ACCESS_CREDENTIAL = 'e2e-credential';

type TGuardedResource = { path: string; hash: string; content_type: string; size: number };

type TContentLockRequest = {
  primary_resource: TGuardedResource;
  secondary_resources?: TGuardedResource[] | Record<string, Omit<TGuardedResource, 'path'>>;
  criteria: { criterion_id: string; verifier_type: string; params: Record<string, unknown> }[];
  lock_logic: unknown;
  access_policy: unknown;
  lock_server?: unknown;
};

/** What a payment for a lock must be, from the content lock the creator published. */
export type TLockPrice = { amount: string; asset: string; recipient: string };

/** Everything the stand-in Lock Server holds; it lives for the whole spec, across sign-ins. */
export type TLockServerState = {
  /** The account the `/connect` approval signs in, z32 without the `pubky` prefix. */
  creatorPubky: string;
  /** Guarded bytes (base64) by path tail, as the creator registered them. */
  guarded: Record<string, string>;
  /** The price of each content lock the creator published, by lock id. */
  locks: Record<string, TLockPrice>;
  /** Lock ids the creator deleted, in order. */
  deletedLocks: string[];
  /** Bundle ids the reader submitted: the lock each pays for, and the task lookups it has had. */
  tasks: Record<string, { lockId: string; lookups: number }>;
};

export const createLockServerState = (): TLockServerState => ({
  creatorPubky: '',
  guarded: {},
  locks: {},
  deletedLocks: [],
  tasks: {},
});

/** The stub client sends `text/plain` so no request needs a CORS preflight; Cypress leaves it a string. */
const parseBody = <T>(body: unknown): T => (typeof body === 'string' && body ? JSON.parse(body) : body) as T;

const CORS_HEADERS = { 'access-control-allow-origin': '*' };

type TStubRequest = CyHttpMessages.IncomingHttpRequest;

/**
 * Answers one stand-in call and logs it as a `[locks-stub]` entry: `summary` names the key
 * parameters, and the entry's console details hold the (redacted) request and response.
 */
const answer = (req: TStubRequest, operation: string, summary: string, body: unknown, statusCode = 200) => {
  logLocksStub(operation, `${summary} → ${statusCode}`, {
    Request: { method: req.method, url: redactLocksStubUrl(req.url), body: parseBody(req.body) },
    Response: { statusCode, body },
  });
  req.reply({ statusCode, body, headers: CORS_HEADERS });
};

const toSecondaryRecord = (resources: TContentLockRequest['secondary_resources']) => {
  if (!Array.isArray(resources)) return resources ?? {};
  return Object.fromEntries(
    resources.map(({ path, hash, content_type, size }) => [path, { hash, content_type, size }]),
  );
};

const priceOf = (body: TContentLockRequest, owner: string): TLockPrice => {
  const params = body.criteria[0]?.params ?? {};
  return {
    amount: String(params['amount'] ?? ''),
    asset: String(params['asset'] ?? ''),
    recipient: String(params['recipient_pubky'] ?? `pubky${owner}`),
  };
};

/** `<creator>/pub/app.locks/<lock_id>.json` → `<lock_id>`. */
const lockIdOf = (lockResource: string) => /\/pub\/app\.locks\/([^/]+)\.json$/.exec(lockResource)?.[1] ?? '';

const describePrice = (price: TLockPrice | undefined) =>
  price ? `${price.amount} sats (${price.asset}) to ${shortPubky(price.recipient)}` : 'an unknown lock';

/** The `/connect` page: posts the approval back to the app the way the real Lock Server shell does. */
const connectPage = (state: string) => `<!doctype html>
<html><body><script>
  window.parent.postMessage(${JSON.stringify({ type: AUTH_MESSAGE_TYPE, code: AUTH_CODE, state })}, '*');
</script></body></html>`;

/** Matches one stub path exactly, whatever its query string. */
const route = (method: 'GET' | 'POST', pathname: string) => ({
  method,
  hostname: new URL(locksStubUrl()).hostname,
  pathname,
});

/**
 * Registers the stand-in Lock Server routes, each under an alias the spec waits on and each logged
 * as a `[locks-stub]` entry. Intercepts reset between tests, so call it in `beforeEach`; the state
 * object carries what was published across tests and sign-ins.
 */
export const stubLockServer = (state: TLockServerState) => {
  cy.intercept(route('GET', '/readyz'), (req) => {
    logLocksStub('lock server readiness', 'GET /readyz → 200 ok', { Request: { url: req.url } });
    req.reply({ statusCode: 200, body: 'ok' });
  }).as('locksReadyz');

  // Pubky Ring / Bitkit approval: the setup dialog embeds `/connect`, which the signer app approves.
  cy.intercept(route('GET', '/connect'), (req) => {
    const authState = new URL(req.url).searchParams.get('state') ?? '';
    logLocksStub(
      'ring/bitkit approval',
      `signer approves Lock Server access for creator ${shortPubky(state.creatorPubky)} → 200 (posts the auth code)`,
      {
        Request: { url: redactLocksStubUrl(req.url) },
        Response: { statusCode: 200, postMessage: { type: AUTH_MESSAGE_TYPE, code: AUTH_CODE, state: authState } },
      },
    );
    req.reply({ statusCode: 200, body: connectPage(authState), headers: { 'content-type': 'text/html' } });
  }).as('locksConnect');

  cy.intercept(route('POST', '/e2e/session/exchange'), (req) => {
    const { code } = parseBody<{ code: string }>(req.body);
    expect(code, 'the code the /connect page posted').to.eq(AUTH_CODE);
    answer(req, 'session exchange', `creator ${shortPubky(state.creatorPubky)} signed in to the Lock Server`, {
      creator: `pubky${state.creatorPubky}`,
    });
  }).as('locksExchange');
  cy.intercept(route('POST', '/e2e/creator/lock-service-pointer'), (req) => {
    const { owner, default_lock_server } = parseBody<{ owner: string; default_lock_server: string }>(req.body);
    answer(req, 'lock service pointer', `${shortPubky(owner)} → Lock Server ${shortPubky(default_lock_server)}`, {});
  }).as('locksServicePointer');
  cy.intercept(route('POST', '/e2e/creator/paykit-setup-status'), (req) => {
    const { owner, asset } = parseBody<{ owner: string; asset: string }>(req.body);
    answer(req, 'bitkit payout setup', `creator ${shortPubky(owner)} receives ${asset}: ready (no Bitkit QR)`, {
      status: 'ready',
    });
  }).as('paykitSetupStatus');

  cy.intercept(route('POST', '/e2e/creator/guarded-resources'), (req) => {
    const { owner, path, content_type, bytes } = parseBody<{
      owner: string;
      path: string;
      content_type: string;
      bytes: string;
    }>(req.body);
    state.guarded[path] = bytes;
    answer(req, 'register guarded resource', `${path} (${content_type}, ${bytes.length} base64 chars)`, {
      creator: `pubky${owner}`,
      guarded_resource: { path: `${GUARDED_CONTENT_PATH}${path}`, hash: `e2e-${path}`, content_type, size: 0 },
    });
  }).as('registerGuardedResource');

  cy.intercept(route('POST', '/e2e/creator/content-locks'), (req) => {
    const { owner, body } = parseBody<{ owner: string; body: TContentLockRequest }>(req.body);
    const lockId = `e2e${Date.now()}`;
    const price = priceOf(body, owner);
    state.locks[lockId] = price;
    answer(req, 'create content lock', `lock ${lockId} for ${describePrice(price)}`, {
      lock_id: lockId,
      content_lock_path: `/pub/app.locks/${lockId}.json`,
      content_lock: {
        version: 1,
        creator: `pubky${owner}`,
        primary_resource: body.primary_resource,
        secondary_resources: toSecondaryRecord(body.secondary_resources),
        criteria: body.criteria,
        lock_logic: body.lock_logic,
        access_policy: body.access_policy,
        lock_server: body.lock_server ?? { override: null },
      },
    });
  }).as('createContentLock');
  cy.intercept(route('POST', '/e2e/creator/content-locks/delete'), (req) => {
    const { lock_id } = parseBody<{ owner: string; lock_id: string }>(req.body);
    state.deletedLocks.push(lock_id);
    answer(req, 'delete content lock', `lock ${lock_id} (${describePrice(state.locks[lock_id])})`, {});
  }).as('deleteContentLock');

  // The reader's Bitkit wallet: it has published Paykit data, it is linked to the creator, and the
  // payment request is paid on the second task lookup (the first one still reads `pending`).
  cy.intercept(route('POST', '/e2e/paykit/has-data'), (req) => {
    const { user } = parseBody<{ user: string }>(req.body);
    answer(req, 'bitkit wallet', `reader ${shortPubky(user)} has Paykit data`, { has_data: true });
  }).as('paykitHasData');
  cy.intercept(route('POST', '/e2e/viewer/proof-bundles'), (req) => {
    const { bundle_id, pubky_lock_resource, reader_public_key } = parseBody<{
      bundle_id: string;
      pubky_lock_resource: string;
      reader_public_key: string;
    }>(req.body);
    const lockId = lockIdOf(pubky_lock_resource);
    state.tasks[bundle_id] = state.tasks[bundle_id] ?? { lockId, lookups: 0 };
    answer(
      req,
      'verify payment',
      `payment request to reader ${shortPubky(reader_public_key)}'s Bitkit: ${describePrice(state.locks[lockId])}, lock ${lockId}`,
      { status: 'pending' },
    );
  }).as('submitProof');
  cy.intercept(route('POST', '/e2e/viewer/verification-tasks'), (req) => {
    const { bundle_id } = parseBody<{ bundle_id: string }>(req.body);
    const task = state.tasks[bundle_id];
    if (task === undefined) {
      answer(req, 'verify payment', `no task for bundle ${bundle_id}`, { error: 'not found' }, 404);
      return;
    }
    const status = task.lookups === 0 ? 'pending' : 'completed';
    task.lookups += 1;
    const price = describePrice(state.locks[task.lockId]);
    answer(
      req,
      'verify payment',
      status === 'pending' ? `Bitkit has not paid ${price} yet: pending` : `Bitkit paid ${price}: completed`,
      { status },
    );
  }).as('lookupVerificationTask');
  cy.intercept(route('POST', '/e2e/viewer/paykit-connection-state'), (req) => {
    const { creator } = parseBody<{ creator: string }>(req.body);
    answer(req, 'bitkit wallet', `reader linked to creator ${shortPubky(creator)}: connected`, {
      state: 'connected',
    });
  }).as('paykitConnectionState');
  cy.intercept(route('POST', '/e2e/viewer/access-credentials'), (req) => {
    const { bundle_id } = parseBody<{ bundle_id: string }>(req.body);
    answer(req, 'access credential', `issued for bundle ${bundle_id}, valid 15 min`, {
      credential: ACCESS_CREDENTIAL,
      expires_at: new Date(Date.now() + 900_000).toISOString(),
    });
  }).as('issueAccessCredential');
  cy.intercept(route('POST', '/e2e/viewer/guarded-resources/read'), (req) => {
    const { credential, path } = parseBody<{ credential: string; path: string }>(req.body);
    const bytes = state.guarded[path];
    if (credential !== ACCESS_CREDENTIAL || bytes === undefined) {
      answer(req, 'guarded read', `${path}: refused`, { error: 'not found' }, 404);
      return;
    }
    answer(req, 'guarded read', `unlock key delivered: ${path} (${bytes.length} base64 chars)`, { bytes });
  }).as('proxyReadGuardedResource');
};

/** The Lock Server's error body (`locks-server/src/api/errors.rs`). */
export const lockServerError = (code: string) => ({ error: { code, message: code.replaceAll('_', ' ') } });

/**
 * Answers the next matching stand-in call with `statusCode` and `body` instead of `stubLockServer`'s
 * route, once: Cypress tries the latest intercept first, and `times: 1` hands every later call back.
 * A non-2xx answer reaches the app as the Locks SDK's own error (`locks.e2eStub.ts`).
 */
export const answerLockServerOnce = (
  method: 'GET' | 'POST',
  pathname: string,
  { statusCode, body, summary }: { statusCode: number; body: unknown; summary: string },
) =>
  cy.intercept({ ...route(method, pathname), times: 1 }, (req) => {
    answer(req, 'one-off answer', `${method} ${pathname}: ${summary}`, body, statusCode);
  });

/**
 * Records every later call to one stand-in route and leaves the answer to the routes registered
 * before it. A one-off answer registered after this one replies first, so its call is not recorded.
 */
export const recordLockServerCalls = (method: 'GET' | 'POST', pathname: string): string[] => {
  const calls: string[] = [];
  cy.intercept(route(method, pathname), (req) => {
    calls.push(redactLocksStubUrl(req.url));
  });
  return calls;
};

/** Adds a paid lock the creator published without the composer to the stand-in Lock Server. */
export const holdSeededLock = (
  state: TLockServerState,
  lock: { lockId: string; guardedPath: string; guardedBytes: string },
  price: TLockPrice,
) => {
  state.guarded[lock.guardedPath] = lock.guardedBytes;
  state.locks[lock.lockId] = price;
};

/** The app's Dexie database (`NEXT_PUBLIC_DB_NAME`, unset in the e2e stack) and its unlocked-lock table. */
const APP_DB_NAME = 'franky';
const LOCKS_TABLE = 'locks';
const REPLICA_READ_TIMEOUT_MS = 30_000;

/** Drops one lock's cached content from the app's IndexedDB, leaving the session and every other row. */
const deleteCachedLock = (lockId: string) =>
  cy.window().then(
    (win) =>
      new Cypress.Promise<void>((resolve, reject) => {
        const open = win.indexedDB.open(APP_DB_NAME);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction(LOCKS_TABLE, 'readwrite');
          transaction.objectStore(LOCKS_TABLE).delete(lockId);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
  );

/**
 * Reloads with this lock's cached content gone, so the unlocked view can only come from the reader's
 * `post.json` replica: the reload must read it, and must make no payment or guarded Lock Server read.
 */
export const reloadFromReaderReplica = (lockId: string, expectUnlockedContent: () => void) => {
  const lockServerCalls: string[] = [];
  deleteCachedLock(lockId);
  cy.intercept(
    { method: 'POST', hostname: new URL(locksStubUrl()).hostname, pathname: /^\/e2e\/(viewer|paykit)\// },
    (req) => {
      lockServerCalls.push(new URL(req.url).pathname);
    },
  );
  const replicaReads: string[] = [];
  // Record the status only once the homeserver has answered. `req.continue(callback)`
  // tells Cypress the test is waiting on that response, so it fails the test when a
  // later navigation (sign-out, reload, `cy.visit`) aborts the request first.
  cy.intercept({ method: 'GET', url: /\/priv\/social\/unlocked\// }, (req) => {
    req.on('response', (res) => {
      replicaReads.push(`${new URL(req.url).pathname} → ${res.statusCode}`);
    });
  }).as('replicaRead');
  cy.reload();
  // The read starts only once the reader's session is restored and the post card has rendered.
  cy.wrap(replicaReads, { timeout: REPLICA_READ_TIMEOUT_MS }).should((reads) => {
    const marker = `/priv/social/unlocked/${lockId}/post.json → 200`;
    expect(
      reads.some((read) => read.endsWith(marker)),
      `the reader's post.json replica read after the reload (seen: ${reads.join(', ') || 'none'})`,
    ).to.be.true;
  });
  expectUnlockedContent();
  cy.then(() => expect(lockServerCalls, 'payment or guarded reads after the reload').to.be.empty);
};

export type TGuardedPost = { content: string; kind: string; attachments: { uri: string; name?: string }[] };

/** Every guarded post (a lock's primary resource) registered so far; attachment bytes are skipped. */
export const registeredGuardedPosts = (state: TLockServerState): TGuardedPost[] =>
  Object.values(state.guarded).flatMap((bytes) => {
    try {
      const post = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(bytes), (char) => char.charCodeAt(0))));
      return post && typeof post === 'object' && 'kind' in post ? [post as TGuardedPost] : [];
    } catch {
      return [];
    }
  });

const homeComposer = () => cy.get('[data-cy="home-post-input"]').filter(':visible');

const lockSwitch = () => homeComposer().find('[data-cy="post-input-action-bar-lock-switch"]').filter(':visible');

/** Types the post's text and drops an image onto the home composer: the content to be locked. */
export const writeLockedPost = (text: string, imageFixture: string) => {
  homeComposer().find('[data-cy="post-input-textarea"]').filter(':visible').click().clear().type(text);
  homeComposer().selectFile(`${Cypress.config('fixturesFolder')}/${imageFixture}`, { action: 'drag-drop' });
  homeComposer().find('[data-cy="post-input-attachment-remove"]').filter(':visible').should('have.length', 1);
};

/** Replaces the post text of a draft the lock switch put back into the composer. */
export const editLockedPostText = (text: string) => {
  homeComposer().find('[data-cy="post-input-textarea"]').filter(':visible').clear().type(text);
  homeComposer().find('[data-cy="post-input-attachment-remove"]').filter(':visible').should('have.length', 1);
};

/**
 * The body editor is lazy-loaded and focuses itself once it mounts (a new article, or a draft the
 * lock switch put back): typing before then sends the rest of the keystrokes into the body.
 */
const waitForArticleEditorFocus = () => {
  cy.focused().closest('.mdxeditor-root-contenteditable').should('exist');
};

// Phones split the article composer into tabs: the title and the body each sit on their own tab.
const showArticleComposerTab = (tab: 'title' | 'content') => {
  if (isMobile()) homeComposer().find(`[data-cy="article-composer-tab-${tab}"]`).filter(':visible').click();
};

const articleTitleInput = () => {
  showArticleComposerTab('title');
  return homeComposer().find('[data-cy="article-title-input"]').filter(':visible');
};

const typeArticleBody = (body: string) => {
  showArticleComposerTab('content');
  // The rich-text toolbar is sticky, so Cypress counts its buttons as hidden while the page header
  // covers them; earlier steps scroll the composer under the header.
  homeComposer().scrollIntoView({ offset: { top: -200, left: 0 } });
  // Exactly one of the two shows, whichever mode the editor is in; only rich text needs the switch.
  homeComposer()
    .find('button[aria-label="Markdown"], [data-cy="article-markdown-textarea"]')
    .filter(':visible')
    .should('have.length', 1)
    .then(($control) => {
      if ($control.is('button')) cy.wrap($control).click();
    });
  homeComposer()
    .find('[data-cy="article-markdown-textarea"]')
    .filter(':visible')
    .clear()
    .type(body, { delay: 0 })
    .should('have.value', body);
};

/** Switches the home composer to an article and writes its title and body: the content to be locked. */
export const writeLockedArticle = (title: string, body: string) => {
  homeComposer().find('[data-cy="post-input-textarea"]').filter(':visible').click();
  homeComposer().find('[data-cy="post-input-action-bar-add-article"]').filter(':visible').click();
  waitForArticleEditorFocus();
  articleTitleInput().type(title, { delay: 0 }).should('have.value', title);
  typeArticleBody(body);
};

/** Replaces the body of an article draft the lock switch put back into the composer. */
export const editLockedArticleBody = (title: string, body: string) => {
  waitForArticleEditorFocus();
  articleTitleInput().should('have.value', title);
  typeArticleBody(body);
};

/**
 * Flips the composer's lock switch on while Locks is not set up yet, and walks the setup dialog:
 * intro, Lock Server approval (the stubbed `/connect` iframe), Paykit status (`ready`), done.
 */
export const turnLockOnAndSetUpLocks = () => {
  lockSwitch().should('not.be.disabled').click();
  cy.wait('@locksReadyz');
  cy.get('[data-cy="locks-auth-intro-continue"]').filter(':visible').should('not.be.disabled').click();
  cy.wait('@locksConnect');
  cy.wait('@locksExchange');
  cy.wait('@paykitSetupStatus');
  cy.get('[data-cy="locks-auth-success-continue"]').filter(':visible').click();
};

/** Walks an open setup dialog through a working Lock Server: intro, approval, Paykit `ready`, done. */
export const completeLocksSetup = () => {
  cy.get('[data-cy="locks-auth-intro-continue"]').filter(':visible').should('not.be.disabled').click();
  cy.get('[data-cy="locks-auth-success-continue"]').filter(':visible').click();
  cy.get('[data-cy="locks-auth-success-continue"]').should('not.exist');
};

/** The Lock Server refuses the next lock deletion, as a Lock Server outage would. */
export const failNextLockDeletion = () => {
  cy.intercept({ ...route('POST', '/e2e/creator/content-locks/delete'), times: 1 }, (req) => {
    answer(req, 'delete content lock', 'Lock Server unavailable', { error: 'unavailable' }, 503);
  }).as('deleteContentLockFailed');
};

/**
 * Signing out drops the Locks session, and only the composer's lock switch signs back in: walk the
 * setup on a throwaway draft, then cancel the price dialog, which turns it back into a normal post.
 */
export const signInToLockServer = () => {
  homeComposer().find('[data-cy="post-input-textarea"]').filter(':visible').click().type('Lock Server sign-in');
  turnLockOnAndSetUpLocks();
  cy.get('[data-cy="lock-content-cancel"]').filter(':visible').click();
  lockSwitch().should('have.attr', 'aria-checked', 'false');
  homeComposer().find('[data-cy="post-input-textarea"]').filter(':visible').clear();
};

/** Flips the lock switch on once Locks is set up in this tab: the price dialog opens straight away. */
export const turnLockOn = () => {
  lockSwitch().should('have.attr', 'aria-checked', 'false').and('not.be.disabled').click();
};

/** Flips the lock switch off, which puts the captured locked draft back into the composer. */
export const turnLockOff = () => {
  lockSwitch().should('have.attr', 'aria-checked', 'true').click();
  lockSwitch().should('have.attr', 'aria-checked', 'false');
};

/** Sets the price in sats in the Lock Content dialog and applies it. */
export const applyLockPrice = (sats: string) => {
  cy.get('[data-cy="lock-amount-input"]').filter(':visible').clear().type(sats);
  cy.get('[data-cy="lock-content-apply"]').filter(':visible').should('not.be.disabled').click();
  cy.get('[data-cy="lock-amount-input"]').should('not.exist');
  lockSwitch().should('have.attr', 'aria-checked', 'true');
};

/** Fills the announcement: the lock card's title and the public teaser. */
export const fillLockAnnouncement = (title: string, teaser: string) => {
  // Focus the (empty) teaser first: it expands the composer, which shows the lock card.
  homeComposer().find('[data-cy="post-input-textarea"]').filter(':visible').should('have.value', '').click();
  homeComposer().find('[data-cy="lock-title-input"]').filter(':visible').clear().type(title);
  homeComposer().find('[data-cy="post-input-textarea"]').filter(':visible').type(teaser);
};

/** Presses Post on the configured lock, for a publish that is expected to fail. */
export const pressPost = () => {
  homeComposer().find('[data-cy="post-input-action-bar-post"]').filter(':visible').should('not.be.disabled').click();
};

/** A failed publish keeps the lock, its title and its teaser, and lets the creator press Post again. */
export const expectLockKept = (title: string, teaser: string) => {
  lockSwitch().should('have.attr', 'aria-checked', 'true');
  homeComposer().find('[data-cy="lock-title-input"]').filter(':visible').should('have.value', title);
  homeComposer().find('[data-cy="post-input-textarea"]').filter(':visible').should('have.value', teaser);
  homeComposer().find('[data-cy="post-input-action-bar-post"]').filter(':visible').should('not.be.disabled');
};

/** The toast with exactly this copy. */
export const expectToast = (description: string) => {
  cy.contains('[data-cy="toast"]', description).should('be.visible');
};

/**
 * Publishes the configured lock from the home composer and yields the announcement's post id, read
 * from its homeserver PUT.
 */
export const publishLock = (): Cypress.Chainable<string> => {
  cy.intercept('PUT', '**/pub/social/v1/posts/**').as('announcementCreated');
  homeComposer().find('[data-cy="post-input-action-bar-post"]').filter(':visible').should('not.be.disabled').click();
  cy.wait('@createContentLock');
  return cy.wait('@announcementCreated').then((interception) => {
    expect(interception.response?.statusCode).to.eq(201);
    return postIdFromWriteUrl(interception.request.url);
  });
};

const NEXUS_POST_POLL_TIMEOUT_MS = 90_000;

/** The announcement as Nexus serves it carries a `lock` URL: that one, when given. */
const nexusDetailsHaveLock = (body: unknown, lockUrl?: string): boolean =>
  typeof body === 'object' &&
  body !== null &&
  'lock' in body &&
  (lockUrl === undefined ? Boolean(body.lock) : body.lock === lockUrl);

/**
 * Polls GET /v1/post/<author>/<id>/details until `settled` is true.
 *
 * The 90s deadline is taken when this command runs. locks.cy.ts calls both waiters from one
 * post-id callback that also queues the later steps, so a Date.now() at the call has already
 * passed by the time the delete poll starts.
 */
const pollNexusPostDetails = (
  authorPubky: string,
  postId: string,
  settled: (status: number, body: unknown) => boolean,
  timedOut: (authorId: string, status: number) => string,
) => {
  const authorId = userIdFromPubky(authorPubky);
  cy.env(['nexusUrl']).then(({ nexusUrl }) => {
    const detailsUrl = `${String(nexusUrl).replace(/\/$/, '')}/v1/post/${authorId}/${postId}/details`;
    const deadline = Date.now() + NEXUS_POST_POLL_TIMEOUT_MS;
    const poll = () => {
      cy.request({ url: detailsUrl, failOnStatusCode: false }).then((response) => {
        if (settled(response.status, response.body)) return;
        if (Date.now() >= deadline) {
          throw new Error(timedOut(authorId, response.status));
        }
        cy.wait(1000);
        poll();
      });
    };
    poll();
  });
};

/**
 * Polls Nexus until it has indexed the announcement, including its top-level `lock` URL (the only
 * thing that tells a reader the post is locked), and that exact URL when `lockUrl` is given. The one
 * fixed wait is the poll interval.
 */
export const waitForNexusLockPost = (authorPubky: string, postId: string, lockUrl?: string) => {
  pollNexusPostDetails(
    authorPubky,
    postId,
    (status, body) => status === 200 && nexusDetailsHaveLock(body, lockUrl),
    (authorId, status) =>
      `Nexus did not index lock post ${authorId}/${postId}${lockUrl ? ` with lock ${lockUrl}` : ''} (last status ${status})`,
  );
};

/**
 * Polls Nexus until it no longer serves the post, so a fresh reader cannot be shown it from there.
 *
 * Known Nexus race: a read of a post while Nexus processes its delete can put it back in the cache, where it answers
 * 200 for good. Call this with nothing else reading the post since its DELETE, so these polls are the only reads; a
 * timeout on a 200 is then that bug, not a slow index. It stays at 404: the stale copy also says `deleted: false`.
 */
export const waitForNexusPostDeleted = (authorPubky: string, postId: string) => {
  pollNexusPostDetails(
    authorPubky,
    postId,
    (status) => status === 404,
    (authorId, status) => `Nexus still serves deleted post ${authorId}/${postId} (last status ${status})`,
  );
};

export const singlePostCard = () => cy.get('[data-cy="single-post-card"]').filter(':visible');

/**
 * Opens the post from the home feed by navigating inside the app. A full page load would make the
 * app restore the session from storage rather than keep the one the sign-in has just created.
 */
export const openPostFromHomeFeed = (authorPubky: string, postId: string, teaser: string) => {
  cy.location('pathname').should('eq', '/home');
  cy.findFirstPostInFeedFiltered(teaser, CheckForNewPosts.No, WaitForNewPosts.Yes).within(() => {
    cy.get('[data-cy="post-text"]').filter(':visible').first().click();
  });
  cy.location('pathname').should('eq', `/post/${userIdFromPubky(authorPubky)}/${postId}`);
  singlePostCard().should('have.length', 1);
};

/** The header shows the profile button only while the app treats the account as signed in. */
export const expectSignedIn = (message: string) => {
  const profileBtn = Cypress.expose('isMobile')
    ? '[data-cy="footer-nav-profile-btn"]'
    : '[data-cy="header-nav-profile-btn"]';
  cy.get('body').should(($body) => {
    expect($body.find(profileBtn).filter(':visible'), message).to.have.length(1);
  });
};
