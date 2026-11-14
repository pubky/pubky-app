/**
 * Locks: a creator locks a post (with an image) and an article, and another reader pays to unlock them.
 * The creator then deletes the locked post: the lock is taken down on the Lock Server first (one
 * refused attempt keeps the post), and the reader no longer sees the teaser or Unlock.
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
 * Everything else is real: Nexus, the homeserver and Homegate. The stand-in Lock Server writes the
 * bytes and the public `lock.json` to the creator's real homeserver before it answers, from Node with
 * the session the creator granted it (`seedLockServerWrite`), exactly where the Lock Server would, so
 * the owner view, the reader's purchase file and the reader's replica all go through the homeserver;
 * the announcement is indexed by the real Nexus.
 *
 * A LOCK FROM BEFORE THE SOCIAL V1 MIGRATION
 * The last test starts from what a 0.x client left on an account that has not migrated yet, seeded
 * through the homeserver API (`createLegacyLockViaApi`): the guarded image post in the 0.x shape under
 * `/priv/app.locks/content/`, the public `/pub/app.locks/<lockId>.json` and the 0.x announcement with
 * the top-level `lock` URL. The stand-in is primed with the guarded bytes and the price, as the Lock
 * Server would hold them. The account migrates on sign-in, and the lock then goes through the same
 * owner view, unlock, edit and delete as one published on the v1 app.
 *
 * The separate pubky-e2e project (in progress) will cover Locks end to end with a real Lock Server,
 * Paykit and Bitkit; this spec covers the app's own flow until then.
 */
import type { CyHttpMessages, Interception } from 'cypress/types/net-stubbing';
import {
  answerLockServerOnce,
  applyLockPrice,
  completeLocksSetup,
  createLockServerState,
  editLockedArticleBody,
  editLockedPostText,
  expectLockKept,
  expectSignedIn,
  expectToast,
  fillLockAnnouncement,
  holdSeededLock,
  lockServerError,
  failNextLockDeletion,
  openPostFromHomeFeed,
  pressPost,
  publishLock,
  recordLockServerCalls,
  registeredGuardedPosts,
  reloadFromReaderReplica,
  signInToLockServer,
  singlePostCard,
  stubLockServer,
  type TLockServerState,
  turnLockOff,
  turnLockOn,
  turnLockOnAndSetUpLocks,
  waitForNexusLockPost,
  waitForNexusPostDeleted,
  writeLockedArticle,
  writeLockedPost,
} from '../support/locks';
import { flushLocksStubLog, locksStep } from '../support/locks-log';
import { holdMigrationFlag, legacyPostPath, migrationFlag } from '../support/migration';
import {
  expectV1PostWrite,
  lockPostIndexed,
  NEXUS_DELETE_SETTLE_MS,
  postContentIndexed,
  postGone,
  postVersionFromWriteUrl,
  userIndexed,
  waitForNexus,
} from '../support/nexus';
import { deletePost } from '../support/posts';
import {
  createLegacyLockViaApi,
  createLockPostViaApi,
  listHomeserverPathsViaApi,
  seedUserViaApi,
} from '../support/seed';
import { CheckForNewPosts, HasBackedUp } from '../support/types/enums';
import type { SeededLockPost, SeededUser } from '../support/types/seed';

const uniqueSuffix = String(Date.now()).slice(-5);
const creatorName = `LockCreator${uniqueSuffix}`;
const readerName = `LockReader${uniqueSuffix}`;
const legacyCreatorName = `LegacyLockCreator${uniqueSuffix}`;
const legacyReaderName = `LegacyLockReader${uniqueSuffix}`;

const FIRST_PRICE_SATS = '1000';
const PRICE_SATS = '2100';
// The lock card prints the price without a space, the Pay to Unlock dialog with one.
const CARD_PRICE_LABEL = '₿2,100';
const DIALOG_PRICE_LABEL = '₿ 2,100';

const POST_STEPS = 8;
const ARTICLE_STEPS = 6;
const LEGACY_STEPS = 7;

const lockServer = createLockServerState();

// Two paid locks the creator publishes through the API, for the reader's error cases: one the
// reader pays for through the errors, one the reader's region refuses.
const seedRun = Date.now();
const paidLock = {
  title: `Paid after errors ${seedRun}`,
  teaser: `A lock paid through errors ${seedRun}`,
  lockedContent: `Unlocked after errors ${seedRun}`,
  amount: PRICE_SATS,
};
const refusedLock = {
  title: `Refused in region ${seedRun}`,
  teaser: `A lock the region refuses ${seedRun}`,
  lockedContent: `Never shown ${seedRun}`,
  amount: PRICE_SATS,
};

let creator: SeededUser;
let reader: SeededUser;
let paidPost: SeededLockPost;
let refusedPost: SeededLockPost;

const signInAs = (user: SeededUser, options?: { migrates?: boolean }) => {
  cy.signInWithPubkyRing(user.name, '/home', options);
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

/** Who pays for a lock, whose lock it is, and the stand-in Lock Server that holds it. */
type TUnlock = { creator: SeededUser; reader: SeededUser; lockServer: TLockServerState };

/**
 * Opens Pay to Unlock as the reader and pays through the stubbed wallet. The payment request must
 * be for this lock (the creator's `lock.json`), delivered to this reader, at the lock's price.
 */
const payToUnlock = (unlock: TUnlock) => {
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
      new RegExp(`^${unlock.creator.id}/pub/app\\.locks/[^/]+\\.json$`),
    );
    expect(bundle.reader_public_key, 'where the payment request is delivered').to.eq(unlock.reader.pubky);
    expect(bundle.proofs).to.have.length(1);
    expect(bundle.proofs[0]).to.include({ criterion_id: 'criterion-1', verifier_type: 'paykit-payment' });
    expect(bundle.bundle_id).to.not.eq('');
    const lockId = /\/pub\/app\.locks\/([^/]+)\.json$/.exec(bundle.pubky_lock_resource)?.[1] ?? '';
    expect(unlock.lockServer.locks[lockId], 'the amount and recipient the Bitkit payment request carries').to.deep.eq({
      amount: PRICE_SATS,
      asset: 'BTC',
      recipient: unlock.creator.pubky,
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

/** The unlocked content shows the locked text and its image, loaded. */
const expectUnlockedImage = (text: string) => {
  singlePostCard()
    .find('[data-cy="locked-post-unlocked-content"]')
    .should('contain.text', text)
    .find('[data-cy="post-attachment-image"]')
    .should('be.visible')
    .and(($image) => expect(($image[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0));
};

describe('locks', () => {
  before(() => {
    seedUserViaApi(creatorName).then((user) => {
      creator = user;
    });
    seedUserViaApi(readerName).then((user) => {
      reader = user;
    });
    cy.then(() => {
      createLockPostViaApi(creator, paidLock).then((post) => {
        paidPost = post;
      });
      createLockPostViaApi(creator, refusedLock).then((post) => {
        refusedPost = post;
      });
    });
    // Both sign in, and the app reads the signed-in account's profile and the seeded locks from Nexus.
    // A seeded post read before its lock is indexed would be cached as a normal post, with no Unlock.
    cy.then(() =>
      waitForNexus(userIndexed(creator), userIndexed(reader), lockPostIndexed(paidPost), lockPostIndexed(refusedPost)),
    );
  });

  beforeEach(() => {
    lockServer.creatorPubky = creator.id;
    for (const post of [paidPost, refusedPost]) {
      holdSeededLock(lockServer, post, { amount: PRICE_SATS, asset: 'BTC', recipient: creator.pubky });
    }
    stubLockServer(lockServer);
  });

  afterEach(() => {
    flushLocksStubLog();
  });

  it('locks a post with an image: the owner sees it, another reader pays to unlock it, the owner deletes it', () => {
    const run = Date.now();
    const draftText = `Locked post draft ${run}`;
    const lockedText = `Locked post text, edited ${run}`;
    const draftTitle = `Draft lock title ${run}`;
    const title = `Locked photo ${run}`;
    const draftTeaser = `Draft teaser ${run}`;
    const teaser = `A photo worth unlocking ${run}`;
    signInAs(creator);

    locksStep(1, POST_STEPS, 'A writes a post with an image and fully locks it');
    writeLockedPost(draftText, 'mustache-you.png');
    turnLockOnAndSetUpLocks();
    applyLockPrice(FIRST_PRICE_SATS);
    fillLockAnnouncement(draftTitle, draftTeaser);

    locksStep(2, POST_STEPS, 'A edits the locked text, title and teaser, re-confirms the lock and saves');
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

      locksStep(3, POST_STEPS, 'Owner view: A sees the locked image and text, with the title and teaser');
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

      locksStep(4, POST_STEPS, 'Locked view: B sees only the title and teaser');
      cy.signOut(HasBackedUp.Yes);
      signInAs(reader);
      openPostFromHomeFeed(creator.pubky, postId, teaser);
      singlePostCard().should('contain.text', teaser).and('not.contain.text', lockedText);
      singlePostCard().find('[data-cy="locked-post-title"]').should('have.text', title);
      singlePostCard().find('[data-cy="locked-post-unlocked-content"]').should('not.exist');
      singlePostCard().find('[data-cy="post-attachment-image"]').should('not.exist');

      locksStep(5, POST_STEPS, 'B pays in bitcoin through the stubbed Bitkit wallet');
      payToUnlock({ creator, reader, lockServer });

      locksStep(6, POST_STEPS, 'Unlocked view: B sees the image and the locked text');
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

      locksStep(7, POST_STEPS, 'A deletes the post: a Lock Server failure keeps it, the retry removes lock and post');
      cy.signOut(HasBackedUp.Yes);
      signInAs(creator);
      signInToLockServer();
      failNextLockDeletion();
      // The unlocked image makes the card tall, so the more button sits near the bottom of the
      // viewport and the menu opens with Delete below the fold. Park the button clear of the
      // sticky header before opening it. The menu is portaled and fixed, so the default click
      // scroll cannot bring that clipped item back on screen.
      cy.findPostInFeed(0, teaser, CheckForNewPosts.Yes).within(() => {
        // The owner's content resolves behind a skeleton after the card renders, and the image then
        // grows the card, so park the button only once the card has its final height.
        cy.get('[data-cy="locked-post-unlocked-content"]')
          .should('contain.text', lockedText)
          .find('[data-cy="post-attachment-image"]')
          .should('be.visible')
          .and(($image) => expect(($image[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0));
        cy.get('[data-cy="post-more-btn"]')
          .first()
          .scrollIntoView({ offset: { top: -200, left: 0 } })
          .should('be.visible')
          .click({ scrollBehavior: false });
      });
      cy.get('[data-cy="post-menu-action-delete"]').should('be.visible').click({ scrollBehavior: false });
      cy.get('[data-cy="dialog-confirm-delete-btn"]').should('be.visible').click();
      cy.wait('@deleteContentLockFailed');
      cy.contains('Could not delete the locked content. Try again.').should('be.visible');
      // A refused lock deletion keeps the row and the confirm dialog, so the retry is the dialog's Delete again.
      cy.get('[data-cy="dialog-content"]').should('be.visible');
      cy.get('[data-cy="timeline-posts"]').should('contain.text', teaser);
      // A v1 post is a directory of versions: each version is one DELETE, `posts/{id}/{editId}.json`.
      cy.intercept('DELETE', `**/pub/social/v1/posts/${postId}/*`).as('announcementDeleted');
      cy.get('[data-cy="dialog-confirm-delete-btn"]').should('be.enabled').click();
      cy.get('[data-cy="dialog-content"]').should('not.exist');
      cy.wait('@announcementDeleted').its('response.statusCode').should('be.oneOf', [200, 204]);
      // The post is deleted only after the Lock Server has accepted the lock deletion.
      cy.get<string>('@lockId').then((lockId) => {
        cy.wrap(lockServer).its('deletedLocks').should('deep.eq', [lockId]);
      });
      // An emptied feed renders its empty state without the `timeline-posts` list, so check the page.
      cy.get('body').should('not.contain.text', teaser);

      locksStep(8, POST_STEPS, 'B no longer sees the teaser or the unlock option');
      waitForNexusPostDeleted(creator.pubky, postId);
      cy.signOut(HasBackedUp.Yes);
      signInAs(reader);
      cy.visit(`/post/${creator.id}/${postId}`);
      cy.get('[data-cy="post-not-found"]:visible', { timeout: 10_000 }).should('have.length', 1);
      // `contain.text` reads textContent, which includes the Next.js flight <script>
      // in the body. That payload repeats the meta description, and a lock's
      // description is the lock title, still served from the fetch cache after Nexus
      // has 404'd. innerText is the text on screen.
      cy.get('body').should(($body) => {
        const visible = ($body[0] as HTMLElement).innerText;
        expect(visible, 'the teaser').not.to.include(teaser);
        expect(visible, 'the title').not.to.include(title);
      });
      cy.get('[data-cy="locked-post-unlock-btn"]').should('not.exist');
    });
  });

  /**
   * An unlocked lock article on the post page uses the article layout, not the post card.
   * The large title is the article's own title (an h1; the card's title is not). The body is the
   * article body. The access label sits in the header. The teaser and the lock card are absent.
   * The home feed stays mounted under the post and still holds both, hidden, so only what is on
   * screen counts.
   */
  const expectUnlockedArticlePage = ({
    articleTitle,
    body,
    draftBody,
    teaser,
    draftTeaser,
    accessLabel,
  }: {
    articleTitle: string;
    body: string;
    draftBody: string;
    teaser: string;
    draftTeaser: string;
    accessLabel: 'My locked content' | 'Unlocked';
  }) => {
    // The card stays up until the article is read, then this title replaces it. Scroll it clear of
    // the sticky header; landing under that header is normal.
    cy.contains('h1', articleTitle)
      .scrollIntoView({ offset: { top: -200, left: 0 } })
      .should('be.visible')
      .and('have.text', articleTitle);
    cy.get('[data-cy="post-text"]')
      .filter(':visible')
      .should('have.length', 1)
      .and('contain.text', body)
      .and('not.contain.text', draftBody)
      .scrollIntoView({ offset: { top: -200, left: 0 } })
      .should('be.visible');
    cy.get('[data-cy="locked-post-access-label"]')
      .filter(':visible')
      .should('have.length', 1)
      .scrollIntoView({ offset: { top: -200, left: 0 } })
      .should('have.text', accessLabel)
      .and('be.visible');
    cy.get('[data-cy="single-post-card"]:visible').should('not.exist');
    cy.get('[data-cy="locked-post-card"]:visible').should('not.exist');
    cy.get('[data-cy="locked-post-title"]:visible').should('not.exist');
    cy.get('[data-cy="locked-post-unlocked-content"]:visible').should('not.exist');
    // innerText is the text on screen. textContent would also read the Next.js flight payload and
    // the hidden feed, which still carry the teaser.
    cy.get('body').should(($body) => {
      const visible = ($body[0] as HTMLElement).innerText;
      expect(visible, 'the teaser').not.to.include(teaser);
      expect(visible, 'the draft teaser').not.to.include(draftTeaser);
    });
  };

  it('locks an article: the owner sees the body, another reader pays to unlock it', () => {
    const run = Date.now();
    const articleTitle = `Locked article ${run}`;
    const draftBody = `Draft article body ${run}`;
    const body = `The full article body, edited ${run}`;
    const draftTitle = `Draft lock title ${run}`;
    const title = `Locked essay ${run}`;
    const draftTeaser = `Draft teaser ${run}`;
    const teaser = `An essay worth unlocking ${run}`;
    signInAs(creator);

    locksStep(1, ARTICLE_STEPS, 'A writes an article and fully locks it');
    writeLockedArticle(articleTitle, draftBody);
    turnLockOnAndSetUpLocks();
    applyLockPrice(FIRST_PRICE_SATS);
    fillLockAnnouncement(draftTitle, draftTeaser);

    locksStep(2, ARTICLE_STEPS, 'A edits the article body, title and teaser, re-confirms the lock and saves');
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
        expect(articles[0]?.kind).to.eq('article');
        expect(articles[0]?.content).to.contain(body).and.not.contain(draftBody);
      });
      cy.wrap(postId).as('postId');
    });

    cy.get<string>('@postId').then((postId) => {
      waitForNexusLockPost(creator.pubky, postId);

      locksStep(3, ARTICLE_STEPS, 'Owner view: A sees the article title and body, not the teaser or lock card');
      openPostFromHomeFeed(creator.pubky, postId, teaser, { requirePostCard: false });
      expectUnlockedArticlePage({
        articleTitle,
        body,
        draftBody,
        teaser,
        draftTeaser,
        accessLabel: 'My locked content',
      });

      locksStep(4, ARTICLE_STEPS, 'Locked view: B sees only the title and teaser');
      cy.signOut(HasBackedUp.Yes);
      signInAs(reader);
      openPostFromHomeFeed(creator.pubky, postId, teaser);
      singlePostCard().should('contain.text', teaser).and('not.contain.text', body);
      singlePostCard().find('[data-cy="locked-post-title"]').should('have.text', title);
      singlePostCard().find('[data-cy="locked-post-unlocked-content"]').should('not.exist');

      locksStep(5, ARTICLE_STEPS, 'B pays in bitcoin through the stubbed Bitkit wallet');
      payToUnlock({ creator, reader, lockServer });

      locksStep(6, ARTICLE_STEPS, 'Unlocked view: B sees the article title and body, not the teaser or lock card');
      expectUnlockedArticlePage({
        articleTitle,
        body,
        draftBody,
        teaser,
        draftTeaser,
        accessLabel: 'Unlocked',
      });

      cy.get<string>('@lockId').then((lockId) =>
        reloadFromReaderReplica(lockId, () => {
          expectSignedIn('the reader is still signed in after a reload');
          expectUnlockedArticlePage({
            articleTitle,
            body,
            draftBody,
            teaser,
            draftTeaser,
            accessLabel: 'Unlocked',
          });
        }),
      );
    });
  });

  /**
   * Lock Server and Paykit errors, one stubbed answer at a time (`answerLockServerOnce`): the app says
   * what went wrong, keeps the lock or the payment, and recovers on the next try. Every status and
   * error code is mapped in the unit tests (`locks.errors.contract.test.ts`), and the setup dialog's
   * errors in `DialogLocksAuth.test.tsx`; these two cover the user-visible recovery of the key flows.
   * The reader's locks are seeded through the homeserver API, so only the creator case uses the
   * composer.
   */
  describe('Lock Server and Paykit errors', () => {
    it('creator: a failed lock and a rejected session keep the lock, and the same lock publishes', () => {
      const run = Date.now();
      const text = `Locked through errors ${run}`;
      const title = `Lock after errors ${run}`;
      const teaser = `Published after errors ${run}`;
      signInAs(creator);

      locksStep(1, 3, 'A writes a post with an image and fully locks it');
      writeLockedPost(text, 'mustache-you.png');
      turnLockOnAndSetUpLocks();
      applyLockPrice(PRICE_SATS);
      fillLockAnnouncement(title, teaser);

      locksStep(2, 3, 'Creating the lock fails: a toast, and the lock, title and teaser stay for another try');
      answerLockServerOnce('POST', '/e2e/creator/content-locks', {
        statusCode: 500,
        body: lockServerError('internal_error'),
        summary: 'internal error',
      });
      pressPost();
      expectToast('Something went wrong. Try again.');
      expectLockKept(title, teaser);

      locksStep(3, 3, 'The Lock Server session is rejected: sign-in reopens, and the same lock publishes');
      answerLockServerOnce('POST', '/e2e/creator/guarded-resources', {
        statusCode: 401,
        body: lockServerError('frontend_session_expired'),
        summary: 'session expired',
      });
      pressPost();
      completeLocksSetup();
      expectLockKept(title, teaser);
      publishLock().then(() => {
        cy.get('@createContentLock').its('request.body').then(expectLockCriterion);
      });
    });

    it('reader: a failed payment start and a refused credential keep the one payment, and a region refusal explains itself', () => {
      signInAs(reader);
      openPostFromHomeFeed(creator.pubky, paidPost.id, paidLock.teaser);

      locksStep(1, 4, 'The proof submission fails: a toast, and Try again starts the payment');
      answerLockServerOnce('POST', '/e2e/viewer/proof-bundles', {
        statusCode: 503,
        body: lockServerError('creator_authority_unavailable'),
        summary: 'creator authority unavailable',
      });
      singlePostCard().find('[data-cy="locked-post-unlock-btn"]').should('not.be.disabled').click();
      expectToast('The payment could not be started. Try again later.');
      cy.get('[data-cy="pay-to-unlock-retry"]').filter(':visible').should('have.text', 'Try again');

      locksStep(2, 4, 'Bitkit pays, but the access credential is refused: the payment stands and nothing opens');
      const proofSubmissions = recordLockServerCalls('POST', '/e2e/viewer/proof-bundles');
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

      locksStep(3, 4, 'Check again issues the credential and opens the content, with no second payment');
      cy.get('[data-cy="pay-to-unlock-recheck"]').filter(':visible').click();
      cy.get('[data-cy="pay-to-unlock-view-content"]').filter(':visible').click();
      singlePostCard().find('[data-cy="locked-post-unlocked-content"]').should('contain.text', paidLock.lockedContent);
      cy.then(() => expect(proofSubmissions, 'payment requests sent to Bitkit after Try again').to.have.length(1));

      locksStep(4, 4, 'A lock the region refuses (HTTP 451) explains itself, with nothing to retry');
      cy.go('back');
      openPostFromHomeFeed(creator.pubky, refusedPost.id, refusedLock.teaser);
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
});

describe('locks published before the migration', () => {
  const legacyLockServer = createLockServerState();

  let legacyCreator: SeededUser;
  let legacyReader: SeededUser;

  before(() => {
    seedUserViaApi(legacyCreatorName, { legacy: true }).then((user) => {
      legacyCreator = user;
      legacyLockServer.creatorPubky = user.id;
    });
    seedUserViaApi(legacyReaderName).then((user) => {
      legacyReader = user;
    });
  });

  beforeEach(() => {
    stubLockServer(legacyLockServer);
  });

  afterEach(() => {
    flushLocksStubLog();
  });

  it('migrates a lock a 0.x client published: the owner sees it, another reader pays to unlock it, the owner edits and deletes it', () => {
    const run = Date.now();
    const lockedText = `Locked before the migration ${run}`;
    const title = `Locked photo from 0.x ${run}`;
    const teaser = `A photo locked before the migration ${run}`;
    const editedTitle = `Locked photo, renamed ${run}`;
    const editedTeaser = `Still worth unlocking after the migration ${run}`;
    const teaserEnvelope = { lock_title: title, teaser_description: teaser, content_kind: 'image' };

    locksStep(
      1,
      LEGACY_STEPS,
      'Before the migration A has a 0.x lock: the guarded post, its lock file, the announcement',
    );
    createLegacyLockViaApi(legacyCreator, lockedText, teaserEnvelope, { amount: PRICE_SATS, asset: 'BTC' }).then(
      (lock) => {
        // The stand-in holds what the Lock Server kept for this lock: the guarded bytes, and the price its
        // lock file states.
        Object.assign(legacyLockServer.guarded, lock.guarded);
        legacyLockServer.locks[lock.lockId] = lock.price;
        // The guarded post is in the 0.x shape, so the owner and the reader below go through the parser's 0.x
        // fallback: a v1 primary has attachment objects, a 0.x one names each attachment by a URI string.
        const guardedPosts = registeredGuardedPosts(legacyLockServer);
        expect(guardedPosts, 'the guarded post').to.have.length(1);
        expect(guardedPosts[0]).to.include({ kind: 'image', content: lockedText });
        expect(guardedPosts[0]?.attachments, 'the guarded attachments').to.have.length(1);
        expect(guardedPosts[0]?.attachments[0], 'a 0.x attachment').to.be.a('string');
        // Until A migrates, Nexus reads the announcement through its 0.x reader, lock URL included.
        waitForNexus(userIndexed(legacyCreator), userIndexed(legacyReader));
        waitForNexusLockPost(legacyCreator.pubky, lock.post.id, lock.lockUrl);

        locksStep(2, LEGACY_STEPS, 'A signs in and migrates: the v1 copy of the announcement keeps the lock URL');
        cy.intercept('PUT', `**/pub/social/v1/posts/${lock.post.id}/*`).as('announcementCopy');
        // The owner view reads the guarded post from A's own homeserver; the home feed may read it first.
        cy.intercept('GET', '**/priv/app.locks/content/*').as('ownGuardedRead');
        holdMigrationFlag();
        signInAs(legacyCreator, { migrates: true });
        migrationFlag().then((flag) => {
          expect(flag.migrated, 'the paths the run copied').to.include(legacyPostPath(lock.post));
        });
        // Exact only because `migrationFlag()` waited for the done flag, which the run writes last. The homeserver
        // holds one version; the intercept may see a retried PUT beside the one that stored it.
        listHomeserverPathsViaApi(legacyCreator, `/pub/social/v1/posts/${lock.post.id}/`).should('have.length', 1);
        cy.get<Interception[]>('@announcementCopy.all').then((writes) => {
          const stored = writes.filter(({ response }) => response?.statusCode === 201);
          expect(stored, 'the stored v1 copy of the announcement').to.have.length(1);
          stored.forEach((copy) =>
            expectV1PostWrite(copy).then((post) => {
              expect(post.kind, 'the announcement kind').to.eq('note');
              expect(post.lock, 'the lock URL').to.eq(lock.lockUrl);
              expect(JSON.parse(post.content), 'the teaser envelope').to.deep.eq(teaserEnvelope);
            }),
          );
        });

        locksStep(3, LEGACY_STEPS, 'Owner view: A sees the locked image and text, read from the 0.x guarded post');
        openPostFromHomeFeed(legacyCreator.pubky, lock.post.id, teaser);
        singlePostCard().should('contain.text', teaser);
        singlePostCard().find('[data-cy="locked-post-title"]').should('have.text', title);
        singlePostCard().find('[data-cy="locked-post-access-label"]').should('have.text', 'My locked content');
        expectUnlockedImage(lockedText);
        singlePostCard().find('[data-cy="locked-post-unlock-btn"]').should('be.disabled');
        // Straight from A's homeserver: the owner never reads through the Lock Server.
        cy.wait('@ownGuardedRead').its('response.statusCode').should('eq', 200);
        cy.get('@proxyReadGuardedResource.all').should('have.length', 0);

        locksStep(4, LEGACY_STEPS, 'Locked view: B sees only the title and teaser');
        cy.signOut(HasBackedUp.Yes);
        signInAs(legacyReader);
        openPostFromHomeFeed(legacyCreator.pubky, lock.post.id, teaser);
        singlePostCard().should('contain.text', teaser).and('not.contain.text', lockedText);
        singlePostCard().find('[data-cy="locked-post-title"]').should('have.text', title);
        singlePostCard().find('[data-cy="locked-post-unlocked-content"]').should('not.exist');
        singlePostCard().find('[data-cy="post-attachment-image"]').should('not.exist');

        locksStep(5, LEGACY_STEPS, 'B pays in bitcoin through the stubbed Bitkit wallet and sees the image and text');
        payToUnlock({ creator: legacyCreator, reader: legacyReader, lockServer: legacyLockServer });
        cy.get<string>('@lockId').should('eq', lock.lockId);
        singlePostCard().find('[data-cy="locked-post-access-label"]').should('have.text', 'Unlocked');
        expectUnlockedImage(lockedText);
        reloadFromReaderReplica(lock.lockId, () => {
          expectSignedIn('the reader is still signed in after a reload');
          singlePostCard().find('[data-cy="locked-post-unlocked-content"]').should('contain.text', lockedText);
          singlePostCard().find('[data-cy="post-attachment-image"]').should('be.visible');
        });

        locksStep(
          6,
          LEGACY_STEPS,
          'A edits the title and teaser: the edit is a new v1 version that keeps the lock URL',
        );
        cy.signOut(HasBackedUp.Yes);
        signInAs(legacyCreator);
        cy.intercept('PUT', `**/pub/social/v1/posts/${lock.post.id}/*`).as('teaserEdited');
        cy.findPostInFeed(0, teaser, CheckForNewPosts.Yes).within(() => {
          cy.get('[data-cy="post-more-btn"]').first().should('be.visible').click();
        });
        cy.get('[data-cy="post-menu-action-edit"]').should('be.visible').click();
        cy.get('[data-cy="edit-post-input"]')
          .should('be.visible')
          .within(() => {
            cy.get('[data-cy="lock-title-input"]').should('have.value', title).clear().type(editedTitle);
            cy.get('[data-cy="post-input-textarea"]').should('have.value', teaser).clear().type(editedTeaser);
            cy.get('[data-cy="post-input-action-bar-edit"]').click();
          });
        cy.get('[data-cy="edit-post-input"]').should('not.exist');
        cy.wait('@teaserEdited').then((edit) => {
          const { postId, editId } = postVersionFromWriteUrl(edit.request.url);
          expect(editId > postId, 'the edit sorts after the post').to.eq(true);
          expectV1PostWrite(edit).then((post) => {
            expect(post.lock, 'the lock URL').to.eq(lock.lockUrl);
            expect(JSON.parse(post.content), 'the teaser envelope').to.deep.eq({
              lock_title: editedTitle,
              teaser_description: editedTeaser,
              content_kind: 'image',
            });
          });
          // The migrated version and the edit
          listHomeserverPathsViaApi(legacyCreator, `/pub/social/v1/posts/${lock.post.id}/`).then((versions) => {
            expect(versions, 'versions of the announcement').to.have.length(2);
            expect(versions.filter((version) => version.endsWith(`/${editId}.json`))).to.have.length(1);
          });
        });
        // Nexus takes a migrated account's v1 writes only after the flip, so the edit shows the flip end to end.
        waitForNexus(postContentIndexed(lock.post, editedTeaser));
        waitForNexusLockPost(legacyCreator.pubky, lock.post.id, lock.lockUrl);

        locksStep(7, LEGACY_STEPS, 'A deletes it: the lock is taken down first, then every copy of the announcement');
        signInToLockServer();
        // The app deletes the lock before any copy of the announcement: each DELETE checks it already has.
        const deletedBeforeTheLock: string[] = [];
        const expectLockDeletedFirst = (req: CyHttpMessages.IncomingHttpRequest) => {
          if (!legacyLockServer.deletedLocks.includes(lock.lockId)) deletedBeforeTheLock.push(req.url);
        };
        cy.intercept('DELETE', `**/pub/pubky.app/posts/${lock.post.id}`, expectLockDeletedFirst).as(
          'legacyCopyDeleted',
        );
        cy.intercept('DELETE', `**/pub/social/v1/posts/${lock.post.id}/*`, expectLockDeletedFirst).as('versionDeleted');
        // The stand-in takes the lock file down once it has accepted the deletion, from Node with the session A
        // granted the Lock Server, and answers only after that DELETE landed (a 500 when it did not), so the
        // browser never sends it. It is A's only lock, so its directory is gone afterwards and a LIST of it
        // answers 404: the file is checked before, and the stand-in's answer after.
        listHomeserverPathsViaApi(legacyCreator, '/pub/app.locks/').then((urls) => {
          expect(urls.filter((url) => url.endsWith(`/pub/app.locks/${lock.lockId}.json`))).to.have.length(1);
        });
        deletePost({ filterText: editedTeaser });
        cy.wait('@deleteContentLock').its('response.statusCode').should('eq', 200);
        cy.wrap(legacyLockServer).its('deletedLocks').should('deep.eq', [lock.lockId]);
        cy.wait('@legacyCopyDeleted').its('response.statusCode').should('be.oneOf', [200, 204]);
        // A v1 post is a directory of versions, one DELETE each: the migrated copy and the edit.
        cy.wait(['@versionDeleted', '@versionDeleted']).then((deletions) => {
          deletions.forEach(({ response }) => {
            expect(response?.statusCode, 'version delete status').to.be.oneOf([200, 204]);
          });
        });
        cy.wrap(deletedBeforeTheLock).should('deep.eq', []);
        cy.get('body').should('not.contain.text', editedTeaser);
        // Nothing of the announcement is left on A's homeserver, in either layout; each tree keeps the profile.
        listHomeserverPathsViaApi(legacyCreator, '/pub/social/v1/').then((paths) => {
          expect(paths.filter((path) => path.includes(`/posts/${lock.post.id}/`))).to.deep.eq([]);
        });
        listHomeserverPathsViaApi(legacyCreator, '/pub/pubky.app/').then((paths) => {
          expect(paths.filter((path) => path.endsWith(`/posts/${lock.post.id}`))).to.deep.eq([]);
        });
        // pubky/pubky-nexus#1213: the first Nexus read of the post comes only after the settle window.
        cy.wait(NEXUS_DELETE_SETTLE_MS);
        waitForNexus(postGone(lock.post));
      },
    );
  });
});
