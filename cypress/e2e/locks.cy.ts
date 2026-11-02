/**
 * Locks: a creator locks a post (with an image) and an article, and another reader pays to unlock them.
 *
 * WHAT IS STUBBED, AND WHY
 * Locks needs the Lock Server, the Paykit Server and the reader's Bitkit wallet, approved from Pubky
 * Ring or Bitkit. None of them can run in CI, so for this spec only their boundary is replaced:
 * - App side: with `PUBKY_RUNTIME_E2E_LOCKS_STUB_URL` set (the Locks CI job only, never a deploy),
 *   `initLockClient()` / `getLocksReads()` in `src/core/services/locks/locks.utils.ts` swap the Locks
 *   SDK client for `src/core/services/locks/locks.e2eStub.ts`, which sends each Lock Server call as
 *   a `POST <stub>/e2e/<operation>`.
 * - Spec side: `stubLockServer()` in `cypress/support/locks.ts` answers those calls with
 *   `cy.intercept`, plus `/readyz` and the `/connect` approval page the setup dialog embeds. That
 *   stands in for: the Lock Server session (code exchange, service pointer), the creator's Paykit
 *   setup (`ready`, so no Bitkit QR), guarded-resource registration and the content lock, the
 *   reader's Bitkit wallet (Paykit data present, link `connected`, payment `pending` then
 *   `completed`), the access credential, and the proxied read of the guarded bytes (unlock-key
 *   delivery).
 * Every stand-in answer is a `[locks-stub]` entry in the command log (`cypress/support/locks-log.ts`):
 * the operation, its key parameters (amount, recipient, lock id, path) and the reply; clicking one
 * shows the redacted request and response in DevTools. Headless runs print the same lines in the
 * terminal, after each `[locks-step]` marker. User A is the creator and user B the reader; both are
 * seeded through the homeserver API (onboarding is covered by onboarding.cy.ts) and sign in through
 * the UI.
 * Everything else is real: Nexus, the homeserver and Homegate. The stub client writes the bytes and
 * the public `lock.json` to the creator's real homeserver with the creator's own session, exactly
 * where the Lock Server would, so the owner view, the reader's purchase file and the reader's
 * replica all go through the homeserver; the announcement is indexed by the real Nexus.
 *
 * The separate pubky-e2e project (in progress) will cover Locks end to end with a real Lock Server,
 * Paykit and Bitkit; this spec covers the app's own flow until then.
 */
import { backupDownloadFilePath } from '../support/common';
import {
  answerLockServerOnce,
  applyLockPrice,
  completeLocksSetup,
  createLockServerState,
  editLockedArticleBody,
  editLockedPostText,
  expectComposerDraft,
  expectLockKept,
  expectLocksSetupMessage,
  expectSignedIn,
  expectToast,
  fillLockAnnouncement,
  holdSeededLock,
  lockServerError,
  openPostFromHomeFeed,
  pressLocksSetupButton,
  pressPost,
  publishLock,
  registeredGuardedPosts,
  reloadFromReaderReplica,
  singlePostCard,
  stubLockServer,
  turnLockOff,
  turnLockOn,
  turnLockOnAndSetUpLocks,
  waitForNexusLockPost,
  writeLockedArticle,
  writeLockedPost,
} from '../support/locks';
import { flushLocksStubLog, locksStep } from '../support/locks-log';
import { postIndexed, userIndexed, waitForNexus } from '../support/nexus';
import { createLockPostViaApi, seedUserViaApi } from '../support/seed';
import { HasBackedUp } from '../support/types/enums';
import type { SeededLockPost, SeededUser } from '../support/types/seed';

const uniqueSuffix = String(Date.now()).slice(-5);
const creatorName = `LockCreator${uniqueSuffix}`;
const readerName = `LockReader${uniqueSuffix}`;

const FIRST_PRICE_SATS = '1000';
const PRICE_SATS = '2100';
// The lock card prints the price without a space, the Pay to Unlock dialog with one.
const CARD_PRICE_LABEL = '₿2,100';
const DIALOG_PRICE_LABEL = '₿ 2,100';

const lockServer = createLockServerState();

let creator: SeededUser;
let reader: SeededUser;

const signInAs = (user: SeededUser) => {
  cy.signInWithEncryptedFile(backupDownloadFilePath(user.name));
};

/** The content lock asks for the edited price, paid to the creator. */
const expectLockCriterion = (body: unknown) => {
  const request = (typeof body === 'string' ? JSON.parse(body) : body) as {
    body: { criteria: { verifier_type: string; params: Record<string, unknown> }[] };
  };
  expect(request.body.criteria).to.have.length(1);
  expect(request.body.criteria[0]?.verifier_type).to.eq('paykit-payment');
  expect(request.body.criteria[0]?.params).to.include({
    recipient_pubky: creator.pubky,
    amount: PRICE_SATS,
    asset: 'BTC',
  });
};

/** One payment poll interval, plus headroom for a slow runner. */
const PAYMENT_POLL_TIMEOUT_MS = 10_000;

const expectTaskStatus = (status: 'pending' | 'completed') => {
  cy.wait('@lookupVerificationTask', { requestTimeout: PAYMENT_POLL_TIMEOUT_MS }).then(({ response }) => {
    const reply = (typeof response?.body === 'string' ? JSON.parse(response.body) : response?.body) as {
      status: string;
    };
    expect(reply.status, 'the verification task status').to.eq(status);
  });
};

/**
 * Opens Pay to Unlock as the reader and pays through the stubbed wallet. The payment request must
 * be for this lock (the creator's `lock.json`), delivered to this reader, at the lock's price.
 */
const payToUnlock = () => {
  cy.intercept('PUT', '**/priv/social/unlocked/**/post.json').as('replicaMarker');
  singlePostCard().find('[data-cy="locked-post-price"]').should('have.text', CARD_PRICE_LABEL);
  singlePostCard().find('[data-cy="locked-post-unlock-btn"]').should('not.be.disabled');
  // A reader the app has signed out gets the sign-in dialog instead of Pay to Unlock.
  expectSignedIn('the reader is still signed in when pressing Unlock');
  singlePostCard().find('[data-cy="locked-post-unlock-btn"]').click();

  cy.wait('@paykitHasData');
  cy.get('[data-cy="pay-to-unlock-price"]').filter(':visible').should('have.text', DIALOG_PRICE_LABEL);
  cy.wait('@submitProof').then(({ request }) => {
    const bundle = (typeof request.body === 'string' ? JSON.parse(request.body) : request.body) as {
      bundle_id: string;
      pubky_lock_resource: string;
      reader_public_key: string;
      proofs: { criterion_id: string; verifier_type: string }[];
    };
    expect(bundle.pubky_lock_resource, 'the lock being paid for').to.match(
      new RegExp(`^${creator.id}/pub/app\\.locks/[^/]+\\.json$`),
    );
    expect(bundle.reader_public_key, 'where the payment request is delivered').to.eq(reader.pubky);
    expect(bundle.proofs).to.have.length(1);
    expect(bundle.proofs[0]).to.include({ criterion_id: 'criterion-1', verifier_type: 'paykit-payment' });
    expect(bundle.bundle_id).to.not.eq('');
    const lockId = /\/pub\/app\.locks\/([^/]+)\.json$/.exec(bundle.pubky_lock_resource)?.[1] ?? '';
    expect(lockServer.locks[lockId], 'the amount and recipient the Bitkit payment request carries').to.deep.eq({
      amount: PRICE_SATS,
      asset: 'BTC',
      recipient: creator.pubky,
    });
    cy.wrap(lockId).as('lockId');
  });
  // The wallet pays on the second lookup: the first one runs as the proof is submitted and reads
  // `pending`, the next comes one payment poll (3 s) later and reads `completed`.
  expectTaskStatus('pending');
  expectTaskStatus('completed');
  cy.wait('@issueAccessCredential');
  cy.get('[data-cy="pay-to-unlock-view-content"]').filter(':visible').click();
  cy.get('[data-cy="pay-to-unlock-view-content"]').should('not.exist');
  cy.wait('@replicaMarker').its('response.statusCode').should('be.oneOf', [200, 201, 204]);
};

describe('locks', () => {
  before(() => {
    cy.deleteDownloadsFolder();

    seedUserViaApi(creatorName, { withRecoveryFile: true }).then((user) => {
      creator = user;
    });
    seedUserViaApi(readerName, { withRecoveryFile: true }).then((user) => {
      reader = user;
    });
    // Both sign in, and the app reads the signed-in account's profile from Nexus
    cy.then(() => waitForNexus(userIndexed(creator), userIndexed(reader)));
  });

  beforeEach(() => {
    lockServer.creatorPubky = creator.id;
    stubLockServer(lockServer);
    signInAs(creator);
  });

  afterEach(() => {
    flushLocksStubLog();
  });

  it('locks a post with an image: the owner sees it, another reader pays to unlock it', () => {
    const run = Date.now();
    const draftText = `Locked post draft ${run}`;
    const lockedText = `Locked post text, edited ${run}`;
    const draftTitle = `Draft lock title ${run}`;
    const title = `Locked photo ${run}`;
    const draftTeaser = `Draft teaser ${run}`;
    const teaser = `A photo worth unlocking ${run}`;

    locksStep(1, 'A writes a post with an image and fully locks it');
    writeLockedPost(draftText, 'mustache-you.png');
    turnLockOnAndSetUpLocks();
    applyLockPrice(FIRST_PRICE_SATS);
    fillLockAnnouncement(draftTitle, draftTeaser);

    locksStep(2, 'A edits the locked text, title and teaser, re-confirms the lock and saves');
    turnLockOff();
    editLockedPostText(lockedText);
    turnLockOn();
    applyLockPrice(PRICE_SATS);
    fillLockAnnouncement(title, teaser);
    publishLock().then((postId) => {
      cy.get('@createContentLock').its('request.body').then(expectLockCriterion);
      cy.wrap(lockServer).then(() => {
        const posts = registeredGuardedPosts(lockServer).filter((post) => post.content.includes(String(run)));
        expect(posts, 'the locked post').to.have.length(1);
        expect(posts[0]).to.include({ kind: 'image', content: lockedText });
        expect(posts[0]?.attachments).to.have.length(1);
      });
      cy.wrap(postId).as('postId');
    });

    cy.get<string>('@postId').then((postId) => {
      waitForNexusLockPost(creator.pubky, postId);

      locksStep(3, 'Owner view: A sees the locked image and text, with the title and teaser');
      openPostFromHomeFeed(creator.pubky, postId, teaser);
      singlePostCard().should('contain.text', teaser).and('not.contain.text', draftTeaser);
      singlePostCard().find('[data-cy="locked-post-title"]').should('have.text', title);
      singlePostCard().find('[data-cy="locked-post-access-label"]').should('have.text', 'My locked content');
      singlePostCard()
        .find('[data-cy="locked-post-unlocked-content"]')
        .should('contain.text', lockedText)
        .and('not.contain.text', draftText)
        .find('[data-cy="post-attachment-image"]')
        .should('be.visible')
        .and(($image) => expect(($image[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0));
      singlePostCard().find('[data-cy="locked-post-unlock-btn"]').should('be.disabled');

      locksStep(4, 'Locked view: B sees only the title and teaser');
      cy.signOut(HasBackedUp.Yes);
      signInAs(reader);
      openPostFromHomeFeed(creator.pubky, postId, teaser);
      singlePostCard().should('contain.text', teaser).and('not.contain.text', lockedText);
      singlePostCard().find('[data-cy="locked-post-title"]').should('have.text', title);
      singlePostCard().find('[data-cy="locked-post-unlocked-content"]').should('not.exist');
      singlePostCard().find('[data-cy="post-attachment-image"]').should('not.exist');

      locksStep(5, 'B pays in bitcoin through the stubbed Bitkit wallet');
      payToUnlock();

      locksStep(6, 'Unlocked view: B sees the image and the locked text');
      singlePostCard().find('[data-cy="locked-post-access-label"]').should('have.text', 'Unlocked');
      singlePostCard()
        .find('[data-cy="locked-post-unlocked-content"]')
        .should('contain.text', lockedText)
        .find('[data-cy="post-attachment-image"]')
        .should('be.visible')
        .and(($image) => expect(($image[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0));

      // A later visit reads the reader's own replica: no further payment or Lock Server read.
      cy.get<string>('@lockId').then((lockId) =>
        reloadFromReaderReplica(lockId, () => {
          expectSignedIn('the reader is still signed in after a reload');
          singlePostCard().find('[data-cy="locked-post-unlocked-content"]').should('contain.text', lockedText);
          singlePostCard().find('[data-cy="post-attachment-image"]').should('be.visible');
        }),
      );
    });
  });

  it('locks an article: the owner sees the body, another reader pays to unlock it', () => {
    const run = Date.now();
    const articleTitle = `Locked article ${run}`;
    const draftBody = `Draft article body ${run}`;
    const body = `The full article body, edited ${run}`;
    const draftTitle = `Draft lock title ${run}`;
    const title = `Locked essay ${run}`;
    const draftTeaser = `Draft teaser ${run}`;
    const teaser = `An essay worth unlocking ${run}`;

    locksStep(1, 'A writes an article and fully locks it');
    writeLockedArticle(articleTitle, draftBody);
    turnLockOnAndSetUpLocks();
    applyLockPrice(FIRST_PRICE_SATS);
    fillLockAnnouncement(draftTitle, draftTeaser);

    locksStep(2, 'A edits the article body, title and teaser, re-confirms the lock and saves');
    turnLockOff();
    editLockedArticleBody(articleTitle, body);
    turnLockOn();
    applyLockPrice(PRICE_SATS);
    fillLockAnnouncement(title, teaser);
    publishLock().then((postId) => {
      cy.get('@createContentLock').its('request.body').then(expectLockCriterion);
      cy.wrap(lockServer).then(() => {
        const articles = registeredGuardedPosts(lockServer).filter((post) => post.content.includes(articleTitle));
        expect(articles, 'the locked article').to.have.length(1);
        expect(articles[0]?.kind).to.eq('long');
        expect(articles[0]?.content).to.contain(body).and.not.contain(draftBody);
      });
      cy.wrap(postId).as('postId');
    });

    cy.get<string>('@postId').then((postId) => {
      waitForNexusLockPost(creator.pubky, postId);

      locksStep(3, 'Owner view: A sees the locked article body, with the title and teaser');
      openPostFromHomeFeed(creator.pubky, postId, teaser);
      singlePostCard().should('contain.text', teaser).and('not.contain.text', draftTeaser);
      singlePostCard().find('[data-cy="locked-post-title"]').should('have.text', title);
      singlePostCard().find('[data-cy="locked-post-access-label"]').should('have.text', 'My locked content');
      singlePostCard()
        .find('[data-cy="locked-post-unlocked-content"]')
        .should('contain.text', articleTitle)
        .and('contain.text', body)
        .and('not.contain.text', draftBody);

      locksStep(4, 'Locked view: B sees only the title and teaser');
      cy.signOut(HasBackedUp.Yes);
      signInAs(reader);
      openPostFromHomeFeed(creator.pubky, postId, teaser);
      singlePostCard().should('contain.text', teaser).and('not.contain.text', body);
      singlePostCard().find('[data-cy="locked-post-title"]').should('have.text', title);
      singlePostCard().find('[data-cy="locked-post-unlocked-content"]').should('not.exist');

      locksStep(5, 'B pays in bitcoin through the stubbed Bitkit wallet');
      payToUnlock();

      locksStep(6, 'Unlocked view: B sees the full article body');
      singlePostCard().find('[data-cy="locked-post-access-label"]').should('have.text', 'Unlocked');
      singlePostCard()
        .find('[data-cy="locked-post-unlocked-content"]')
        .should('contain.text', articleTitle)
        .and('contain.text', body);

      cy.get<string>('@lockId').then((lockId) =>
        reloadFromReaderReplica(lockId, () => {
          expectSignedIn('the reader is still signed in after a reload');
          singlePostCard().find('[data-cy="locked-post-unlocked-content"]').should('contain.text', body);
        }),
      );
    });
  });
});

/**
 * Lock Server and Paykit errors, one stubbed answer at a time (`answerLockServerOnce`): the app says
 * what went wrong, keeps the draft, the lock or the payment, and recovers on the next try. Every
 * status and error code is mapped in the unit tests (`locks.errors.contract.test.ts`); these cover
 * the user-visible recovery of the key flows. The reader's locks are seeded through the homeserver
 * API, so only the creator case uses the composer.
 */
describe('locks: Lock Server and Paykit errors', () => {
  const errorsCreatorName = `LockErrCreator${uniqueSuffix}`;
  const errorsReaderName = `LockErrReader${uniqueSuffix}`;
  const run = Date.now();
  const paidLock = {
    title: `Paid after errors ${run}`,
    teaser: `A lock paid through errors ${run}`,
    lockedContent: `Unlocked after errors ${run}`,
    amount: PRICE_SATS,
  };
  const refusedLock = {
    title: `Refused in region ${run}`,
    teaser: `A lock the region refuses ${run}`,
    lockedContent: `Never shown ${run}`,
    amount: PRICE_SATS,
  };
  let lockCreator: SeededUser;
  let lockReader: SeededUser;
  let paidPost: SeededLockPost;
  let refusedPost: SeededLockPost;

  before(() => {
    seedUserViaApi(errorsCreatorName, { withRecoveryFile: true }).then((user) => {
      lockCreator = user;
    });
    seedUserViaApi(errorsReaderName, { withRecoveryFile: true }).then((user) => {
      lockReader = user;
    });
    cy.then(() => {
      createLockPostViaApi(lockCreator, paidLock).then((post) => {
        paidPost = post;
      });
      createLockPostViaApi(lockCreator, refusedLock).then((post) => {
        refusedPost = post;
      });
    });
    cy.then(() =>
      waitForNexus(userIndexed(lockCreator), userIndexed(lockReader), postIndexed(paidPost), postIndexed(refusedPost)),
    );
  });

  beforeEach(() => {
    lockServer.creatorPubky = lockCreator.id;
    for (const post of [paidPost, refusedPost]) {
      holdSeededLock(lockServer, post, { amount: PRICE_SATS, asset: 'BTC', recipient: lockCreator.pubky });
    }
    stubLockServer(lockServer);
  });

  afterEach(() => {
    flushLocksStubLog();
  });

  it('creator: recovers from an unready Lock Server, failed sign-in, Paykit outage and failed publishes', () => {
    const text = `Locked through errors ${run}`;
    const title = `Lock after errors ${run}`;
    const teaser = `Published after errors ${run}`;
    signInAs(lockCreator);

    locksStep(1, 'The Lock Server is not ready: setup says so, and Cancel gives the draft back');
    writeLockedPost(text, 'mustache-you.png');
    answerLockServerOnce('GET', '/readyz', { statusCode: 503, body: 'not ready', summary: 'not ready' });
    turnLockOn();
    expectLocksSetupMessage('The Lock Server is unavailable right now. Please try again later.');
    cy.get('[data-cy="locks-auth-intro-continue"]').filter(':visible').should('be.disabled');
    pressLocksSetupButton('Cancel');
    expectComposerDraft(text);

    locksStep(2, 'The approval code has expired: setup says so, and Try again signs in');
    answerLockServerOnce('POST', '/e2e/session/exchange', {
      statusCode: 410,
      body: lockServerError('frontend_session_code_expired'),
      summary: 'code expired',
    });
    turnLockOn();
    cy.get('[data-cy="locks-auth-intro-continue"]').filter(':visible').should('not.be.disabled').click();
    expectLocksSetupMessage('Something went wrong while authorizing the Lock Server.');

    locksStep(3, 'Paykit cannot answer: setup says payments are unavailable, and Try again finishes it');
    answerLockServerOnce('POST', '/e2e/creator/paykit-setup-status', {
      statusCode: 200,
      body: { status: 'unavailable' },
      summary: 'Paykit unavailable',
    });
    pressLocksSetupButton('Try again');
    expectLocksSetupMessage('Payments are unavailable right now. Please try again later.');
    pressLocksSetupButton('Try again');
    cy.get('[data-cy="locks-auth-success-continue"]').filter(':visible').click();
    applyLockPrice(PRICE_SATS);
    fillLockAnnouncement(title, teaser);

    locksStep(4, 'Creating the lock fails: a toast, and the lock, title and teaser stay for another try');
    answerLockServerOnce('POST', '/e2e/creator/content-locks', {
      statusCode: 500,
      body: lockServerError('internal_error'),
      summary: 'internal error',
    });
    pressPost();
    expectToast('Something went wrong. Try again.');
    expectLockKept(title, teaser);

    locksStep(5, 'The Lock Server session is rejected: sign-in reopens, and the same lock publishes');
    answerLockServerOnce('POST', '/e2e/creator/guarded-resources', {
      statusCode: 401,
      body: lockServerError('frontend_session_expired'),
      summary: 'session expired',
    });
    pressPost();
    completeLocksSetup();
    expectLockKept(title, teaser);
    publishLock();
  });

  it('reader: a failed payment start and a failed credential keep the payment, and it opens', () => {
    signInAs(lockReader);
    openPostFromHomeFeed(lockCreator.pubky, paidPost.id, paidLock.teaser);

    locksStep(1, 'The proof submission fails: a toast, and Try again starts the same payment');
    answerLockServerOnce('POST', '/e2e/viewer/proof-bundles', {
      statusCode: 503,
      body: lockServerError('creator_authority_unavailable'),
      summary: 'creator authority unavailable',
    });
    singlePostCard().find('[data-cy="locked-post-unlock-btn"]').should('not.be.disabled').click();
    expectToast('The payment could not be started. Try again later.');
    cy.get('[data-cy="pay-to-unlock-retry"]').filter(':visible').should('have.text', 'Try again');

    locksStep(2, 'Bitkit pays, but the access credential is refused: the payment stands and nothing opens');
    answerLockServerOnce('POST', '/e2e/viewer/access-credentials', {
      statusCode: 403,
      body: lockServerError('entitlement_not_authorized'),
      summary: 'entitlement not authorized',
    });
    cy.get('[data-cy="pay-to-unlock-retry"]').filter(':visible').click();
    expectToast('Your payment went through, but the content could not be opened. Nothing is lost — try again.');
    cy.get('[role="dialog"]')
      .filter(':visible')
      .should('contain.text', 'Payment received. The content could not be opened — nothing is lost.');
    singlePostCard().should('not.contain.text', paidLock.lockedContent);

    locksStep(3, 'Check again issues the credential and opens the content');
    cy.get('[data-cy="pay-to-unlock-recheck"]').filter(':visible').click();
    cy.get('[data-cy="pay-to-unlock-view-content"]').filter(':visible').click();
    singlePostCard().find('[data-cy="locked-post-unlocked-content"]').should('contain.text', paidLock.lockedContent);
  });

  it('reader: a region refusal (HTTP 451) explains itself, with nothing to retry', () => {
    signInAs(lockReader);
    openPostFromHomeFeed(lockCreator.pubky, refusedPost.id, refusedLock.teaser);

    answerLockServerOnce('POST', '/e2e/viewer/proof-bundles', {
      statusCode: 451,
      body: {},
      summary: 'unavailable for legal reasons',
    });
    singlePostCard().find('[data-cy="locked-post-unlock-btn"]').should('not.be.disabled').click();
    cy.get('[data-testid="locks-region-notice"]')
      .filter(':visible')
      .should('contain.text', "Paid unlocks aren't available in your region yet.");
    cy.get('[data-cy="pay-to-unlock-retry"]').should('not.exist');
    cy.contains('[data-cy="toast"]', 'The payment could not be started').should('not.exist');
    cy.get('[data-cy="pay-to-unlock-cancel"]').filter(':visible').should('have.text', 'Close').click();
    singlePostCard().should('not.contain.text', refusedLock.lockedContent);
  });
});
