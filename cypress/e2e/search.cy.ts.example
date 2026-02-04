import { backupDownloadFilePath } from '../support/auth';
import { slowCypressDown } from 'cypress-slow-down';
// registers the cy.slowDown and cy.slowDownEnd commands
import 'cypress-slow-down/commands';
import { createQuickPost, createQuickPostWithTags, waitForFeedToLoad } from '../support/posts';
import { CheckIndexed } from '../support/types/enums';

const username = 'Mr Search';

describe('search', () => {
  before(() => {
    slowCypressDown();
    cy.deleteDownloadsFolder();
    cy.onboardAsNewUser(username, 'I like to search');
    cy.backupRecoveryFile();
    cy.renameFile(backupDownloadFilePath(), backupDownloadFilePath(username));
  });

  beforeEach(() => {
    // sign in if not already
    cy.location('pathname').then((currentPath) => {
      if (currentPath !== '/home') {
        cy.signIn(backupDownloadFilePath(username));
        waitForFeedToLoad();
      }
    });
  });

  // TODO: continue test once search bug is fixed, see https://github.com/pubky/pubky-app/issues/1427
  it('can search for tag to find posts with that tag', () => {
    const uniqueId = Cypress._.uniqueId(Date.now().toString().slice(-2));
    const tag1 = `tag1-${uniqueId}`;
    const tag2 = `tag2-${uniqueId}`;
    const tag3 = `tag3-${uniqueId}`;
    const postTag1 = `Post with tag1 and tag3 ${Date.now()}`;
    const postTag2 = `Post with tag2 ${Date.now()}`;
    const postTags2and3 = `Post with tag2 and tag3 ${Date.now()}`;
    const postNoTags = `Post with no tags ${Date.now()}`;

    // create a post with tag1
    createQuickPostWithTags(postTag1, [tag1]);
    // create a post with tag2
    createQuickPostWithTags(postTag2, [tag2]);
    // create a post with tag1 and tag2
    createQuickPostWithTags(postTags2and3, [tag2, tag3]);
    // create a post with no tags
    createQuickPost(postNoTags);

    // wait for posts to be indexed before searching
    cy.findFirstPostInFeed(CheckIndexed.Yes);

    // search for a single tag
    cy.get('#header-search-input').type(tag1).type('{enter}');
    // confirm tag remains displayed in the search bar
    cy.get('#header-search').innerTextShouldContain(tag1);

    // confirm one post is seen in result
    cy.get('#post-search-results').children().should('have.length', 1);
    cy.log('postTag1', postTag1);
    // confirm correct post is seen in result and click it
    cy.findPostInSearchResults(postTag1).innerTextShouldContain(postTag1).innerTextShouldNotContain(postTag2).click();

    // check that we are on the post view page
    cy.location('pathname').should('contain', '/post/');

    // wait a short while and check that the post is still visible and no redirect has occurred
    // verify bugfix https://github.com/pubky/pubky-app/pull/1786
    cy.wait(500);
    cy.location('pathname').should('contain', '/post/');

    // check that the post content is visible
    cy.get('#post-view-modal')
      .get('#post-container')
      .get('#post-content-text')
      .should('be.visible')
      .innerTextShouldContain(postTag1);

    // navigate back to search results
    cy.go('back');

    // check that we are on the search results page
    cy.location('pathname').should('contain', '/search');

    // check that the post is still visible in search results
    cy.findPostInSearchResults(postTag1).should('be.visible');

    // search for two tags
    cy.get('#header-search-input').type(tag2).type('{enter}');
    // confirm both tags remain displayed in the search bar
    cy.get('#header-search').innerTextShouldContain(tag1).innerTextShouldContain(tag2);

    // confirm three posts are seen in result
    cy.get('#post-search-results').children().should('have.length', 3);
    // confirm correct posts are seen in result
    cy.findPostInSearchResults(postTag1).innerTextShouldContain(tag1);
    cy.findPostInSearchResults(postTag2).innerTextShouldContain(tag2);
    cy.findPostInSearchResults(postTags2and3).innerTextShouldContain(tag2).innerTextShouldContain(tag3);

    // remove first tag from search

    // confirm two posts remain in result
  });
});
