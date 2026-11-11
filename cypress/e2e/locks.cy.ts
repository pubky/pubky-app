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
 * Everything else is real: Nexus, the homeserver and Homegate. The stub client writes the bytes and
 * the public `lock.json` to the creator's real homeserver with the creator's own session, exactly
 * where the Lock Server would, so the owner view, the reader's purchase file and the reader's
 * replica all go through the homeserver; the announcement is indexed by the real Nexus.
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
import { backupDownloadFilePath } from '../support/common';
import {
  applyLockPrice,
  createLockServerState,
  editLockedArticleBody,
  editLockedPostText,
  expectSignedIn,
  fillLockAnnouncement,
  failNextLockDeletion,
  openPostFromHomeFeed,
  publishLock,
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
  NEXUS_DELETE_SETTLE_MS,
  postContentIndexed,
  postGone,
  postVersionFromWriteUrl,
  userIndexed,
  waitForNexus,
} from '../support/nexus';
import { deletePost } from '../support/posts';
import { createLegacyLockViaApi, listHomeserverPathsViaApi, seedUserViaApi } from '../support/seed';
import { CheckForNewPosts, HasBackedUp } from '../support/types/enums';
import type { SeededUser } from '../support/types/seed';

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

let creator: SeededUser;
let reader: SeededUser;

const signInAs = (user: SeededUser, options?: { migrates?: boolean }) => {
  cy.signInWithEncryptedFile(backupDownloadFilePath(user.name), undefined, options);
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

  it('locks a post with an image: the owner sees it, another reader pays to unlock it, the owner deletes it', () => {
    const run = Date.now();
    const draftText = `Locked post draft ${run}`;
    const lockedText = `Locked post text, edited ${run}`;
    const draftTitle = `Draft lock title ${run}`;
    const title = `Locked photo ${run}`;
    const draftTeaser = `Draft teaser ${run}`;
    const teaser = `A photo worth unlocking ${run}`;

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
      cy.findPostInFeed(0, teaser, CheckForNewPosts.Yes).within(() => {
        cy.get('[data-cy="post-more-btn"]').first().should('be.visible').click();
      });
      cy.get('[data-cy="post-menu-action-delete"]').should('be.visible').click();
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

  it('locks an article: the owner sees the body, another reader pays to unlock it', () => {
    const run = Date.now();
    const articleTitle = `Locked article ${run}`;
    const draftBody = `Draft article body ${run}`;
    const body = `The full article body, edited ${run}`;
    const draftTitle = `Draft lock title ${run}`;
    const title = `Locked essay ${run}`;
    const draftTeaser = `Draft teaser ${run}`;
    const teaser = `An essay worth unlocking ${run}`;

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

      locksStep(3, ARTICLE_STEPS, 'Owner view: A sees the locked article body, with the title and teaser');
      openPostFromHomeFeed(creator.pubky, postId, teaser);
      singlePostCard().should('contain.text', teaser).and('not.contain.text', draftTeaser);
      singlePostCard().find('[data-cy="locked-post-title"]').should('have.text', title);
      singlePostCard().find('[data-cy="locked-post-access-label"]').should('have.text', 'My locked content');
      singlePostCard()
        .find('[data-cy="locked-post-unlocked-content"]')
        .should('contain.text', articleTitle)
        .and('contain.text', body)
        .and('not.contain.text', draftBody);

      locksStep(4, ARTICLE_STEPS, 'Locked view: B sees only the title and teaser');
      cy.signOut(HasBackedUp.Yes);
      signInAs(reader);
      openPostFromHomeFeed(creator.pubky, postId, teaser);
      singlePostCard().should('contain.text', teaser).and('not.contain.text', body);
      singlePostCard().find('[data-cy="locked-post-title"]').should('have.text', title);
      singlePostCard().find('[data-cy="locked-post-unlocked-content"]').should('not.exist');

      locksStep(5, ARTICLE_STEPS, 'B pays in bitcoin through the stubbed Bitkit wallet');
      payToUnlock({ creator, reader, lockServer });

      locksStep(6, ARTICLE_STEPS, 'Unlocked view: B sees the full article body');
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

describe('locks published before the migration', () => {
  const legacyLockServer = createLockServerState();

  let legacyCreator: SeededUser;
  let legacyReader: SeededUser;

  before(() => {
    seedUserViaApi(legacyCreatorName, { legacy: true, withRecoveryFile: true }).then((user) => {
      legacyCreator = user;
      legacyLockServer.creatorPubky = user.id;
    });
    seedUserViaApi(legacyReaderName, { withRecoveryFile: true }).then((user) => {
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
        // The stand-in takes the lock file down once it has accepted the deletion. It is A's only lock, so its
        // directory is gone afterwards and a LIST of it answers 404: the file is checked before, and its DELETE after.
        listHomeserverPathsViaApi(legacyCreator, '/pub/app.locks/').then((urls) => {
          expect(urls.filter((url) => url.endsWith(`/pub/app.locks/${lock.lockId}.json`))).to.have.length(1);
        });
        cy.intercept('DELETE', `**/pub/app.locks/${lock.lockId}.json`).as('lockFileDeleted');
        deletePost({ filterText: editedTeaser });
        cy.wait('@deleteContentLock');
        cy.wrap(legacyLockServer).its('deletedLocks').should('deep.eq', [lock.lockId]);
        cy.wait('@lockFileDeleted').its('response.statusCode').should('be.oneOf', [200, 204]);
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
