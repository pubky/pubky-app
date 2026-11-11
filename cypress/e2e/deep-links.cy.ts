import { slowCypressDown } from 'cypress-slow-down';
import 'cypress-slow-down/commands';
import { waitForServiceWorker } from '../support/common';
import { LEGACY_MEDIA_ROUTE, V1_MEDIA_ROUTE, expectImageServed } from '../support/media';
import { isMobile, itMobile } from '../support/mobile';
import { postIndexed, repliesIndexed, streamIndexed, userIndexed, waitForNexus } from '../support/nexus';
import {
  createArticleViaApi,
  createCollectionViaApi,
  createImagePostViaApi,
  createPostViaApi,
  replyViaApi,
  repostViaApi,
  seedUserViaApi,
} from '../support/seed';
import type { SeededPost } from '../support/types/seed';

const username = 'Mr Deep Link';
const userBio = 'Shared links should open for everyone';
const runId = Date.now().toString();
const postText = `deep link ${runId} post`;
const collectionName = `Deep link ${runId} collection`;
const collectionItemText = `deep link ${runId} collection item`;
const articleTitle = `deep link ${runId} article`;
const articleBody = `deep link ${runId} article body`;

// A valid pubky (52 z-base-32 characters) that no homeserver or Nexus knows about
const UNKNOWN_PUBKY = 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';
// A well-formed post id that the author never wrote
const UNKNOWN_POST_ID = '0000000000000';
// More than the one item a spec's collection holds
const COLLECTION_STREAM_LIMIT = 20;
// Not-found views no longer wait out the 15s indexing retry (#2602); stay well below it
const NOT_FOUND_TIMEOUT = { timeout: 10_000 };

// Opens the sign-in prompt from a write action, then dismisses it
const assertWriteAsksToSignIn = (trigger: string) => {
  cy.get(trigger).should('have.length', 1).click();
  cy.get('[data-cy="sign-in-dialog-join-btn"]:visible').should('have.length', 1);
  cy.get('[data-cy="sign-in-dialog-sign-in-btn"]:visible').should('have.length', 1);
  cy.get('[data-cy="dialog-close"]:visible').should('have.length', 1).click();
  cy.get('[data-cy="sign-in-dialog-join-btn"]:visible').should('not.exist');
};

// Any write or delete under either root of any namespace: a signed-out visitor makes none
const expectNoHomeserverWrites = () => {
  beforeEach(() => {
    cy.intercept({ method: /^(PUT|DELETE)$/, url: '**/{pub,priv}/**' }).as('homeserverWrite');
  });

  afterEach(() => {
    cy.get('@homeserverWrite.all').should('have.length', 0);
  });
};

const LAYOUTS = [
  { title: 'logged-out deep links', legacy: false },
  // A 0.x account stays in the old layout until it signs in; the app still reads it through Nexus
  { title: 'logged-out deep links to an un-migrated account', legacy: true },
];

LAYOUTS.forEach(({ title, legacy }) => {
  describe(title, () => {
    let authorId = '';
    let postId = '';
    let collectionId = '';
    let collectionItemId = '';
    let articleId = '';

    // Seeded through the API: onboarding, posting and creating a collection in the UI are covered in
    // onboarding.cy.ts, posts.cy.ts and collections.cy.ts. Nothing is signed in, as a shared link opens.
    before(() => {
      slowCypressDown();
      // Installs the app while the seeds index, so the not-found views are not timed mid-install
      cy.visit('/');

      seedUserViaApi(username, { bio: userBio, legacy }).then((author) => {
        authorId = author.id;
        createPostViaApi(author, postText).then((post) => {
          postId = post.id;
          createArticleViaApi(author, articleTitle, articleBody, { coverFixture: 'mustache-you.png' }).then(
            (article) => {
              articleId = article.id;
              createPostViaApi(author, collectionItemText).then((item) => {
                collectionItemId = item.id;
                createCollectionViaApi(author, collectionName, { items: [item], layout: 'list' }).then((collection) => {
                  collectionId = collection.id;
                  // The page lists the items its envelope names and reads each from Nexus by id
                  waitForNexus(
                    userIndexed(author),
                    postIndexed(post),
                    postIndexed(article),
                    postIndexed(item),
                    postIndexed(collection),
                  );
                });
              });
            },
          );
        });
      });
      waitForServiceWorker();
    });

    expectNoHomeserverWrites();

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

    itMobile('opens a collection and asks to sign in before following it', () => {
      cy.visit(`/collections/${authorId}/${collectionId}`);

      cy.get('[data-cy="collection-hero"]:visible').should('have.length', 1).and('contain.text', collectionName);
      // The list layout renders each item as a one-line snippet row, not a full post body. Phones
      // collapse the list layout to inline posts, so the item shows as its full post text there.
      const itemText = isMobile() ? 'post-text' : 'post-list-snippet';
      cy.get(`[data-cy="post-card"]:visible [data-cy="${itemText}"]:visible`).should(($snippets) => {
        const snippets = $snippets.toArray().map((snippet) => snippet.textContent?.trim());
        expect(snippets, 'collection items').to.include(collectionItemText);
      });
      assertWriteAsksToSignIn('[data-cy="collection-hero-follow-btn"]:visible');
    });

    // The page reads membership from the envelope (#2744), but a client pages the items from this stream, which Nexus
    // fills from either envelope: a v1 collection's items are objects, a 0.x one's are strings (Nexus contract C1).
    it('lists the items of a collection in its stream', () => {
      waitForNexus(
        streamIndexed(
          { source: 'collection', author_id: authorId, post_id: collectionId },
          [collectionItemId],
          COLLECTION_STREAM_LIMIT,
        ),
      );
    });

    it('opens an article with its title, body and cover', () => {
      cy.visit(`/post/${authorId}/${articleId}`);

      cy.contains('h1', articleTitle).should('be.visible');
      cy.get('[data-cy="post-text"]:visible').should('contain.text', articleBody);
      // Only the article's cover is a <picture>. Each layout's file is served from its own route.
      expectImageServed(() => cy.get('picture img'), legacy ? LEGACY_MEDIA_ROUTE : V1_MEDIA_ROUTE);
    });

    it('shows the not-found view for a post that does not exist', () => {
      cy.visit(`/post/${authorId}/${UNKNOWN_POST_ID}`);

      cy.get('[data-cy="post-not-found"]:visible', NOT_FOUND_TIMEOUT).should('have.length', 1);
      cy.get('[data-cy="single-post-card"]:visible').should('not.exist');
    });
  });
});

describe('logged-out deep link to an unknown profile', () => {
  before(() => {
    slowCypressDown();
    cy.visit('/');
    waitForServiceWorker();
  });

  expectNoHomeserverWrites();

  it('shows the not-found view for a profile that does not exist', () => {
    cy.visit(`/profile/${UNKNOWN_PUBKY}`);

    cy.get('[data-cy="profile-not-found"]:visible', NOT_FOUND_TIMEOUT).should('have.length', 1);
    cy.get('[data-cy="profile-username-header"]:visible').should('not.exist');
  });
});

// Each client spells a reference to a post its own way, whichever layout the post itself is in:
// a 0.x client writes `/pub/pubky.app/posts/{id}`, this app `/pub/social/v1/posts/{id}`.
describe('logged-out deep links across both data layouts', () => {
  const singlePost = '[data-cy="single-post-card"]:visible';
  const threadReply = '[data-cy="thread-reply"]:visible';
  const v1Text = `layouts ${runId} post by a migrated account`;
  const legacyText = `layouts ${runId} post by an un-migrated account`;
  const v1ReplyText = `layouts ${runId} reply by a migrated account`;
  const legacyReplyText = `layouts ${runId} reply by an un-migrated account`;
  const v1QuoteText = `layouts ${runId} repost by a migrated account`;
  const legacyQuoteText = `layouts ${runId} repost by an un-migrated account`;
  const legacyImageText = `layouts ${runId} image by an un-migrated account`;
  const v1ImageText = `layouts ${runId} image by a migrated account`;

  let v1Post: SeededPost;
  let legacyPost: SeededPost;
  let v1Quote: SeededPost;
  let legacyQuote: SeededPost;
  let legacyImage: SeededPost;
  let v1Image: SeededPost;

  before(() => {
    slowCypressDown();
    cy.visit('/');

    seedUserViaApi('Ms New Layout').then((v1User) => {
      seedUserViaApi('Mr Old Layout', { legacy: true }).then((legacyUser) => {
        createPostViaApi(v1User, v1Text).then((post) => {
          v1Post = post;
        });
        createPostViaApi(legacyUser, legacyText).then((post) => {
          legacyPost = post;
        });
        createImagePostViaApi(legacyUser, legacyImageText).then((post) => {
          legacyImage = post;
        });
        createImagePostViaApi(v1User, v1ImageText).then((post) => {
          v1Image = post;
        });
        cy.then(() => {
          replyViaApi(legacyUser, v1Post, legacyReplyText).then((legacyReply) => {
            replyViaApi(v1User, legacyPost, v1ReplyText).then((v1Reply) => {
              repostViaApi(legacyUser, v1Post, legacyQuoteText).then((quote) => {
                legacyQuote = quote;
              });
              repostViaApi(v1User, legacyPost, v1QuoteText).then((quote) => {
                v1Quote = quote;
              });
              cy.then(() => {
                waitForNexus(
                  postIndexed(v1Post),
                  postIndexed(legacyPost),
                  postIndexed(legacyReply),
                  postIndexed(v1Reply),
                  repliesIndexed(v1Post, [legacyReply]),
                  repliesIndexed(legacyPost, [v1Reply]),
                  postIndexed(legacyQuote),
                  postIndexed(v1Quote),
                  postIndexed(legacyImage),
                  postIndexed(v1Image),
                );
              });
            });
          });
        });
      });
    });
    waitForServiceWorker();
  });

  expectNoHomeserverWrites();

  it("shows an un-migrated account's reply under a migrated account's post", () => {
    cy.visit(`/post/${v1Post.authorId}/${v1Post.id}`);

    cy.get(singlePost).find('[data-cy="post-text"]').first().should('contain.text', v1Text);
    cy.contains(threadReply, legacyReplyText).should('exist');
  });

  it("shows a migrated account's reply under an un-migrated account's post", () => {
    cy.visit(`/post/${legacyPost.authorId}/${legacyPost.id}`);

    cy.get(singlePost).find('[data-cy="post-text"]').first().should('contain.text', legacyText);
    cy.contains(threadReply, v1ReplyText).should('exist');
  });

  it("embeds a migrated account's post in an un-migrated account's repost", () => {
    cy.visit(`/post/${legacyQuote.authorId}/${legacyQuote.id}`);

    cy.get(singlePost).should('contain.text', legacyQuoteText).and('contain.text', v1Text);
  });

  it("embeds an un-migrated account's post in a migrated account's repost", () => {
    cy.visit(`/post/${v1Quote.authorId}/${v1Quote.id}`);

    cy.get(singlePost).should('contain.text', v1QuoteText).and('contain.text', legacyText);
  });

  // The served bytes are the point, and each layout's file has its own route. A visitor reads a 0.x file's type
  // from Nexus's file details and a v1 file's from its extension.
  it("loads the image of an un-migrated account's post", () => {
    cy.visit(`/post/${legacyImage.authorId}/${legacyImage.id}`);

    cy.get(singlePost).should('contain.text', legacyImageText);
    expectImageServed(() => cy.get(singlePost).find('[data-cy="post-attachment-image"]'), LEGACY_MEDIA_ROUTE);
  });

  it("loads the image of a migrated account's post", () => {
    cy.visit(`/post/${v1Image.authorId}/${v1Image.id}`);

    cy.get(singlePost).should('contain.text', v1ImageText);
    expectImageServed(() => cy.get(singlePost).find('[data-cy="post-attachment-image"]'), V1_MEDIA_ROUTE);
  });
});
