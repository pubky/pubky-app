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
  /** Bundle ids the reader submitted: the lock each pays for, and the task lookups it has had. */
  tasks: Record<string, { lockId: string; lookups: number }>;
};

export const createLockServerState = (): TLockServerState => ({
  creatorPubky: '',
  guarded: {},
  locks: {},
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

export type TGuardedPost = { content: string; kind: string; attachments: string[] | null };

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

const typeArticleBody = (body: string) => {
  homeComposer().find('button[aria-label="Markdown"]').filter(':visible').click();
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
  homeComposer().find('[data-cy="article-title-input"]').filter(':visible').type(title, { delay: 0 });
  typeArticleBody(body);
};

/** Replaces the body of an article draft the lock switch put back into the composer. */
export const editLockedArticleBody = (title: string, body: string) => {
  homeComposer().find('[data-cy="article-title-input"]').filter(':visible').should('have.value', title);
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

/**
 * Publishes the configured lock from the home composer and yields the announcement's post id, read
 * from its homeserver PUT.
 */
export const publishLock = (): Cypress.Chainable<string> => {
  cy.intercept('PUT', '**/pub/pubky.app/posts/**').as('announcementCreated');
  homeComposer().find('[data-cy="post-input-action-bar-post"]').filter(':visible').should('not.be.disabled').click();
  cy.wait('@createContentLock');
  return cy.wait('@announcementCreated').then((interception) => {
    expect(interception.response?.statusCode).to.eq(201);
    const postId = new URL(interception.request.url).pathname.split('/').pop() ?? '';
    expect(postId, 'announcement post id').to.not.eq('');
    return postId;
  });
};

/**
 * Polls Nexus until it has indexed the announcement, including its top-level `lock` URL (the only
 * thing that tells a reader the post is locked). The one fixed wait is the poll interval.
 */
export const waitForNexusLockPost = (authorPubky: string, postId: string) => {
  const authorId = userIdFromPubky(authorPubky);
  const deadline = Date.now() + 90_000;
  cy.env(['nexusUrl']).then(({ nexusUrl }) => {
    const detailsUrl = `${String(nexusUrl).replace(/\/$/, '')}/v0/post/${authorId}/${postId}/details`;
    const poll = () => {
      cy.request({ url: detailsUrl, failOnStatusCode: false }).then((response) => {
        if (response.status === 200 && response.body?.lock) return;
        if (Date.now() >= deadline) {
          throw new Error(`Nexus did not index lock post ${authorId}/${postId} (last status ${response.status})`);
        }
        cy.wait(1000);
        poll();
      });
    };
    poll();
  });
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
