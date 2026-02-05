import { backupDownloadFilePath } from '../support/auth';
import { slowCypressDown } from 'cypress-slow-down';
import 'cypress-slow-down/commands';
import { createQuickPost, waitForFeedToLoad } from '../support/posts';
import { CheckForNewPosts } from '../support/types/enums';

const username = 'Mr Search';

describe('search', () => {
  before(() => {
    slowCypressDown();
    cy.deleteDownloadsFolder();
    cy.onboardAsNewUser(username, 'I like to search');
  });

  beforeEach(() => {
    // sign in if not already
    cy.location('pathname').then((currentPath) => {
      if (currentPath !== '/home') {
        cy.signInWithEncryptedFile(backupDownloadFilePath(username));
        waitForFeedToLoad();
      }
    });
  });

  it('can search for tag to find posts with that tag', () => {
    const uniqueId = Cypress._.uniqueId(Date.now().toString().slice(-2));
    const tag1 = `tag1-${uniqueId}`;
    const tag2 = `tag2-${uniqueId}`;
    const tag3 = `tag3-${uniqueId}`;
    const postTag1 = `Post with tag1 ${Date.now()}`;
    const postTag2 = `Post with tag2 ${Date.now()}`;
    const postTags2and3 = `Post with tag2 and tag3 ${Date.now()}`;
    const postNoTags = `Post with no tags ${Date.now()}`;

    // create a post with tag1
    createQuickPost(postTag1, [tag1]);
    // create a post with tag2
    createQuickPost(postTag2, [tag2]);
    // create a post with tag2 and tag3
    createQuickPost(postTags2and3, [tag2, tag3]);
    // create a post with no tags
    createQuickPost(postNoTags);

    // wait for posts to appear in feed before searching
    cy.findFirstPostInFeed(CheckForNewPosts.Yes);

    // search for a single tag
    cy.get('[data-cy="header-search-input"]').type(tag1).type('{enter}');

    // confirm tag remains displayed in the search bar
    cy.get('[data-cy="header-search"]').innerTextShouldContain(tag1);

    // confirm one post card is seen in result with expected content and tag
    cy.get('[data-cy="post-search-results"]')
      .find('[data-cy="post-card"]')
      .should('have.length', 1)
      .first()
      .within(() => {
        cy.get('[data-cy="post-text"]').innerTextShouldContain(postTag1);
        cy.contains(tag1).should('be.visible');
      });

    // confirm correct post is seen in result and click it
    cy.findPostInSearchResults(postTag1).innerTextShouldContain(postTag1).innerTextShouldNotContain(postTag2).click();

    // check that we are on the post view page
    cy.location('pathname').should('contain', '/post/');

    // wait a short while and check that the post is still visible and no redirect has occurred
    cy.wait(500);
    cy.location('pathname').should('contain', '/post/');

    // check that the post content is visible
    cy.get('[data-cy="post-text"]').should('be.visible').innerTextShouldContain(postTag1);

    // navigate back to search results
    cy.go('back');

    // check that we are on the search results page
    cy.location('pathname').should('contain', '/search');

    // check that the post is still visible in search results
    cy.findPostInSearchResults(postTag1).should('be.visible');

    // search for an additional tag (tag2)
    cy.get('[data-cy="header-search-input"]').filter(':visible').type(tag2).type('{enter}');

    // confirm both tags remain displayed in the search bar
    cy.get('[data-cy="header-search"]').innerTextShouldContain(tag1).innerTextShouldContain(tag2);

    // confirm three post cards are seen in result (posts matching tag1 OR tag2)
    cy.get('[data-cy="post-search-results"]').find('[data-cy="post-card"]').should('have.length', 3);

    // confirm correct posts are seen in result with expected content and tags
    cy.findPostInSearchResults(postTag1).innerTextShouldContain(postTag1).innerTextShouldContain(tag1);
    cy.findPostInSearchResults(postTag2).innerTextShouldContain(postTag2).innerTextShouldContain(tag2);
    cy.findPostInSearchResults(postTags2and3)
      .innerTextShouldContain(postTags2and3)
      .innerTextShouldContain(tag2)
      .innerTextShouldContain(tag3);
  });
});
