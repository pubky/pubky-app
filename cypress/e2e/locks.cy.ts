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
 * Everything else is real: Nexus, the homeserver and Homegate. The stub client writes the bytes and
 * the public `lock.json` to the creator's real homeserver with the creator's own session, exactly
 * where the Lock Server would, so the owner view, the reader's purchase file and the reader's
 * replica all go through the homeserver; the announcement is indexed by the real Nexus.
 *
 * The separate pubky-e2e project (in progress) will cover Locks end to end with a real Lock Server,
 * Paykit and Bitkit; this spec covers the app's own flow until then.
 */
import { slowCypressDown } from 'cypress-slow-down';
import 'cypress-slow-down/commands';
import { backupDownloadFilePath } from '../support/auth';
import { userIdFromPubky } from '../support/common';
import {
  applyLockPrice,
  createLockServerState,
  editLockedArticleBody,
  editLockedPostText,
  expectSignedIn,
  fillLockAnnouncement,
  openPostFromHomeFeed,
  publishLock,
  registeredGuardedPosts,
  singlePostCard,
  stubLockServer,
  turnLockOff,
  turnLockOn,
  turnLockOnAndSetUpLocks,
  waitForNexusLockPost,
  writeLockedArticle,
  writeLockedPost,
} from '../support/locks';
import { BackupType, HasBackedUp } from '../support/types/enums';

const uniqueSuffix = String(Date.now()).slice(-5);
const creator = { username: `LockCreator${uniqueSuffix}`, pubkyAlias: 'pubky_locks_creator' };
const reader = { username: `LockReader${uniqueSuffix}`, pubkyAlias: 'pubky_locks_reader' };

const FIRST_PRICE_SATS = '1000';
const PRICE_SATS = '2100';
// The lock card prints the price without a space, the Pay to Unlock dialog with one.
const CARD_PRICE_LABEL = '₿2,100';
const DIALOG_PRICE_LABEL = '₿ 2,100';

const lockServer = createLockServerState();

const creatorPubky = () => String(Cypress.expose(creator.pubkyAlias));
const readerPubky = () => String(Cypress.expose(reader.pubkyAlias));

const signInAs = (profile: { username: string }) => {
  cy.signInWithEncryptedFile(backupDownloadFilePath(profile.username));
};

/** The content lock asks for the edited price, paid to the creator. */
const expectLockCriterion = (body: unknown) => {
  const request = (typeof body === 'string' ? JSON.parse(body) : body) as {
    body: { criteria: { verifier_type: string; params: Record<string, unknown> }[] };
  };
  expect(request.body.criteria).to.have.length(1);
  expect(request.body.criteria[0]?.verifier_type).to.eq('paykit-payment');
  expect(request.body.criteria[0]?.params).to.include({
    recipient_pubky: creatorPubky(),
    amount: PRICE_SATS,
    asset: 'BTC',
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
      new RegExp(`^${userIdFromPubky(creatorPubky())}/pub/app\\.locks/[^/]+\\.json$`),
    );
    expect(bundle.reader_public_key, 'where the payment request is delivered').to.eq(readerPubky());
    expect(bundle.proofs).to.have.length(1);
    expect(bundle.proofs[0]).to.include({ criterion_id: 'criterion-1', verifier_type: 'paykit-payment' });
    expect(bundle.bundle_id).to.not.eq('');
  });
  cy.wait('@issueAccessCredential');
  cy.get('[data-cy="pay-to-unlock-view-content"]').filter(':visible').click();
  cy.get('[data-cy="pay-to-unlock-view-content"]').should('not.exist');
  cy.wait('@replicaMarker').its('response.statusCode').should('be.oneOf', [200, 201, 204]);
};

describe('locks', () => {
  before(() => {
    slowCypressDown();
    cy.deleteDownloadsFolder();

    cy.onboardAsNewUser(reader.username, '', [BackupType.EncryptedFile], reader.pubkyAlias);
    cy.signOut(HasBackedUp.Yes);

    cy.onboardAsNewUser(creator.username, '', [BackupType.EncryptedFile], creator.pubkyAlias);
    cy.signOut(HasBackedUp.Yes);
  });

  beforeEach(() => {
    lockServer.creatorPubky = userIdFromPubky(creatorPubky());
    stubLockServer(lockServer);
    signInAs(creator);
  });

  it('locks a post with an image: the owner sees it, another reader pays to unlock it', () => {
    const run = Date.now();
    const draftText = `Locked post draft ${run}`;
    const lockedText = `Locked post text, edited ${run}`;
    const draftTitle = `Draft lock title ${run}`;
    const title = `Locked photo ${run}`;
    const draftTeaser = `Draft teaser ${run}`;
    const teaser = `A photo worth unlocking ${run}`;

    cy.log('1. The creator writes a post with an image and fully locks it');
    writeLockedPost(draftText, 'mustache-you.png');
    turnLockOnAndSetUpLocks();
    applyLockPrice(FIRST_PRICE_SATS);
    fillLockAnnouncement(draftTitle, draftTeaser);

    cy.log('2. The creator edits the locked text, title and teaser, re-confirms the lock and saves');
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
      waitForNexusLockPost(creatorPubky(), postId);

      cy.log('3. The owner sees the locked image and text, with the title and teaser');
      openPostFromHomeFeed(creatorPubky(), postId, teaser);
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

      cy.log('4. Another reader sees only the title and teaser');
      cy.signOut(HasBackedUp.Yes);
      signInAs(reader);
      openPostFromHomeFeed(creatorPubky(), postId, teaser);
      singlePostCard().should('contain.text', teaser).and('not.contain.text', lockedText);
      singlePostCard().find('[data-cy="locked-post-title"]').should('have.text', title);
      singlePostCard().find('[data-cy="locked-post-unlocked-content"]').should('not.exist');
      singlePostCard().find('[data-cy="post-attachment-image"]').should('not.exist');

      cy.log('5. The reader pays in bitcoin through the stubbed wallet');
      payToUnlock();

      cy.log('6. The reader sees the image and the locked text');
      singlePostCard().find('[data-cy="locked-post-access-label"]').should('have.text', 'Unlocked');
      singlePostCard()
        .find('[data-cy="locked-post-unlocked-content"]')
        .should('contain.text', lockedText)
        .find('[data-cy="post-attachment-image"]')
        .should('be.visible')
        .and(($image) => expect(($image[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0));

      // A later visit reads the reader's own replica: no further payment or Lock Server read.
      cy.reload();
      expectSignedIn('the reader is still signed in after a reload');
      singlePostCard().find('[data-cy="locked-post-unlocked-content"]').should('contain.text', lockedText);
      singlePostCard().find('[data-cy="post-attachment-image"]').should('be.visible');
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

    cy.log('1. The creator writes an article and fully locks it');
    writeLockedArticle(articleTitle, draftBody);
    turnLockOnAndSetUpLocks();
    applyLockPrice(FIRST_PRICE_SATS);
    fillLockAnnouncement(draftTitle, draftTeaser);

    cy.log('2. The creator edits the article body, title and teaser, re-confirms the lock and saves');
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
      waitForNexusLockPost(creatorPubky(), postId);

      cy.log('3. The owner sees the locked article body, with the title and teaser');
      openPostFromHomeFeed(creatorPubky(), postId, teaser);
      singlePostCard().should('contain.text', teaser).and('not.contain.text', draftTeaser);
      singlePostCard().find('[data-cy="locked-post-title"]').should('have.text', title);
      singlePostCard().find('[data-cy="locked-post-access-label"]').should('have.text', 'My locked content');
      singlePostCard()
        .find('[data-cy="locked-post-unlocked-content"]')
        .should('contain.text', articleTitle)
        .and('contain.text', body)
        .and('not.contain.text', draftBody);

      cy.log('4. Another reader sees only the title and teaser');
      cy.signOut(HasBackedUp.Yes);
      signInAs(reader);
      openPostFromHomeFeed(creatorPubky(), postId, teaser);
      singlePostCard().should('contain.text', teaser).and('not.contain.text', body);
      singlePostCard().find('[data-cy="locked-post-title"]').should('have.text', title);
      singlePostCard().find('[data-cy="locked-post-unlocked-content"]').should('not.exist');

      cy.log('5. The reader pays in bitcoin through the stubbed wallet');
      payToUnlock();

      cy.log('6. The reader sees the full article body');
      singlePostCard().find('[data-cy="locked-post-access-label"]').should('have.text', 'Unlocked');
      singlePostCard()
        .find('[data-cy="locked-post-unlocked-content"]')
        .should('contain.text', articleTitle)
        .and('contain.text', body);

      cy.reload();
      expectSignedIn('the reader is still signed in after a reload');
      singlePostCard().find('[data-cy="locked-post-unlocked-content"]').should('contain.text', body);
    });
  });
});
