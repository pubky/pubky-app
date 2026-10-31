import { slowCypressDown } from 'cypress-slow-down';
import 'cypress-slow-down/commands';
import { waitForServiceWorker } from '../support/common';
import { postIndexed, userIndexed, waitForNexus } from '../support/nexus';
import { seededStreamIndexed } from '../support/pagination';
import { createCollectionViaApi, createPostViaApi, seedUserViaApi } from '../support/seed';

const username = 'Mr Deep Link';
const userBio = 'Shared links should open for everyone';
const runId = Date.now().toString();
const postText = `deep link ${runId} post`;
const collectionName = `Deep link ${runId} collection`;
const collectionItemText = `deep link ${runId} collection item`;

// A valid pubky (52 z-base-32 characters) that no homeserver or Nexus knows about
const UNKNOWN_PUBKY = 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';
// A well-formed post id that the author never wrote
const UNKNOWN_POST_ID = '0000000000000';
// Not-found views no longer wait out the 15s indexing retry (#2602); stay well below it
const NOT_FOUND_TIMEOUT = { timeout: 10_000 };

let authorId = '';
let postId = '';
let collectionId = '';

// Opens the sign-in prompt from a write action, then dismisses it
const assertWriteAsksToSignIn = (trigger: string) => {
  cy.get(trigger).should('have.length', 1).click();
  cy.get('[data-cy="sign-in-dialog-join-btn"]:visible').should('have.length', 1);
  cy.get('[data-cy="sign-in-dialog-sign-in-btn"]:visible').should('have.length', 1);
  cy.get('[data-cy="dialog-close"]:visible').should('have.length', 1).click();
  cy.get('[data-cy="sign-in-dialog-join-btn"]:visible').should('not.exist');
};

describe('logged-out deep links', () => {
  // Seeded through the API: onboarding, posting and creating a collection in the UI are covered in
  // onboarding.cy.ts, posts.cy.ts and collections.cy.ts. Nothing is signed in, as a shared link opens.
  before(() => {
    slowCypressDown();
    // Installs the app while the seeds index, so the not-found views are not timed mid-install
    cy.visit('/');

    seedUserViaApi(username, { bio: userBio }).then((author) => {
      authorId = author.id;
      createPostViaApi(author, postText).then((post) => {
        postId = post.id;
        createPostViaApi(author, collectionItemText).then((item) =>
          createCollectionViaApi(author, collectionName, { items: [item], layout: 'list' }).then((collection) => {
            collectionId = collection.id;
            waitForNexus(
              userIndexed(author),
              postIndexed(post),
              postIndexed(collection),
              seededStreamIndexed({ source: 'collection', author_id: authorId, post_id: collectionId }, [item.id]),
            );
          }),
        );
      });
    });
    waitForServiceWorker();
  });

  beforeEach(() => {
    cy.intercept('PUT', '**/pub/pubky.app/**').as('homeserverWrite');
  });

  afterEach(() => {
    cy.get('@homeserverWrite.all').should('have.length', 0);
  });

  it('opens a post and asks to sign in before replying or saving', () => {
    cy.visit(`/post/${authorId}/${postId}`);

    cy.get('[data-cy="single-post-card"]:visible')
      .should('have.length', 1)
      .find('[data-cy="post-text"]')
      .first()
      .should('contain.text', postText);
    cy.get('[data-cy="single-post-card"]:visible').find('[data-cy="post-reply-btn"]').as('replyButton');
    assertWriteAsksToSignIn('@replyButton');
    cy.get('[data-cy="single-post-card"]:visible').find('[data-cy="post-bookmark-btn"]').as('saveButton');
    assertWriteAsksToSignIn('@saveButton');
  });

  it('opens a profile and asks to sign in before following', () => {
    cy.visit(`/profile/${authorId}`);

    cy.get('[data-cy="profile-username-header"]:visible').should('have.length', 1).and('contain.text', username);
    assertWriteAsksToSignIn('[data-cy="profile-follow-toggle-btn"]:visible');
  });

  it('opens a collection and asks to sign in before following it', () => {
    cy.visit(`/collections/${authorId}/${collectionId}`);

    cy.get('[data-cy="collection-hero"]:visible').should('have.length', 1).and('contain.text', collectionName);
    // The list layout renders each item as a one-line snippet row, not a full post body
    cy.get('[data-cy="post-card"]:visible [data-cy="post-list-snippet"]:visible').should(($snippets) => {
      const snippets = $snippets.toArray().map((snippet) => snippet.textContent?.trim());
      expect(snippets, 'collection items').to.include(collectionItemText);
    });
    assertWriteAsksToSignIn('[data-cy="collection-hero-follow-btn"]:visible');
  });

  it('shows the not-found view for a post that does not exist', () => {
    cy.visit(`/post/${authorId}/${UNKNOWN_POST_ID}`);

    cy.get('[data-cy="post-not-found"]:visible', NOT_FOUND_TIMEOUT).should('have.length', 1);
    cy.get('[data-cy="single-post-card"]:visible').should('not.exist');
  });

  it('shows the not-found view for a profile that does not exist', () => {
    cy.visit(`/profile/${UNKNOWN_PUBKY}`);

    cy.get('[data-cy="profile-not-found"]:visible', NOT_FOUND_TIMEOUT).should('have.length', 1);
    cy.get('[data-cy="profile-username-header"]:visible').should('not.exist');
  });
});
