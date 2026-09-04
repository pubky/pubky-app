import { backupDownloadFilePath } from '../support/common';
import { slowCypressDown } from 'cypress-slow-down';
import 'cypress-slow-down/commands';
import { addTagsToCollectionHero, createCollection, findCollectionCardInSection } from '../support/collections';
import { goToCollectionsPage, goToProfilePageFromHeader } from '../support/header';
import { createQuickPost, waitForFeedToLoad } from '../support/posts';
import { addProfileTags } from '../support/profile';
import { BackupType, CheckForNewPosts } from '../support/types/enums';

const username = 'Mr Search';

// unique suffix shared by all tags and posts created in the `before` hook so
// that each test can rely on the same fixture data
const uniqueId = Cypress._.uniqueId(Date.now().toString().slice(-2));
const tag1 = `tag1-${uniqueId}`;
const tag2 = `tag2-${uniqueId}`;
const tag3 = `tag3-${uniqueId}`;
// letters-only unique word so full-text search matches exactly one post even if
// the index tokenizer splits terms on letter/digit boundaries
// (content query limits: min 2 chars, max 30 chars, max 4 terms)
const uniqueWord = `findme${Date.now()
  .toString()
  .replace(/\d/g, (digit) => 'abcdefghij'[Number(digit)])}`;
const postTag1 = `Post with tag1 ${uniqueWord}`;
const postTag2 = `Post with tag2 ${Date.now()}`;
const postTags2and3 = `Post with tag2 and tag3 ${Date.now()}`;
const postNoTags = `Post with no tags ${Date.now()}`;

describe('search', () => {
  before(() => {
    slowCypressDown();
    cy.deleteDownloadsFolder();
    cy.onboardAsNewUser(username, 'I like to search', [BackupType.EncryptedFile]);

    // create the posts searched for by the tests below
    createQuickPost(postTag1, [tag1]);
    createQuickPost(postTag2, [tag2]);
    createQuickPost(postTags2and3, [tag2, tag3]);
    createQuickPost(postNoTags);

    // wait for posts to appear in feed so they are indexed before searching
    cy.findFirstPostInFeed(CheckForNewPosts.Yes);
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

  it('can search posts by tag filters', () => {
    // open search results for a single tag
    cy.visit(`/search?tags=${tag1}`);

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

    // add the second tag through the UI: type a prefix and click the
    // autocomplete tag suggestion (covers addTagToSearch → buildSearchUrl →
    // router.push, which a direct cy.visit would skip)
    cy.get('[data-cy="header-search-input"]').filter(':visible').type(tag2);
    cy.get(`[data-cy="post-tag"][data-tag-label="${tag2}"]`, { timeout: 10000 }).filter(':visible').click();

    // the URL now carries both tags
    cy.location('search', { timeout: 10000 }).should('contain', `tags=${tag1},${tag2}`);

    // close the suggestions dropdown before asserting on the results below it
    cy.get('body').click(0, 0);

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

    // remove the second tag through the search-bar chip (UI-initiated tag search path)
    cy.get('[data-cy="header-search"]')
      .filter(':visible')
      .within(() => {
        cy.get(`[aria-label="Remove ${tag2} tag"]`).click();
      });

    // the URL, chips, and results narrow back down to the first tag only
    cy.location('search').should('contain', `tags=${tag1}`).should('not.contain', tag2);
    cy.get('[data-cy="header-search"]').innerTextShouldContain(tag1).innerTextShouldNotContain(tag2);
    cy.get('[data-cy="post-search-results"]').find('[data-cy="post-card"]').should('have.length', 1);
  });

  it('can search posts by full-text query', () => {
    // full-text search for the unique word from the first post's text
    cy.get('[data-cy="header-search-input"]').filter(':visible').type(uniqueWord).type('{enter}');

    // check that we are on the full-text search results page
    cy.location('pathname').should('contain', '/search');
    cy.location('search').should('contain', `q=${uniqueWord}`);

    // confirm the search input shows the active query (seeded from the URL)
    cy.get('[data-cy="header-search-input"]').filter(':visible').should('have.value', uniqueWord);

    // confirm only the matching post is seen in result with expected content
    cy.get('[data-cy="post-search-results"]')
      .find('[data-cy="post-card"]')
      .should('have.length', 1)
      .first()
      .within(() => {
        cy.get('[data-cy="post-text"]').innerTextShouldContain(postTag1);
      });

    // a post without the word is not in the results
    cy.get('[data-cy="post-search-results"]').innerTextShouldNotContain(postNoTags);
  });

  it('can search people by tag', () => {
    const profileTag = `person-${uniqueId}`;

    // tag own profile from the profile 'Tagged' tab
    goToProfilePageFromHeader();
    cy.get('[data-cy="profile-filter-item-tagged"]').click();
    addProfileTags([profileTag]);
    cy.get('[data-cy="profile-tab-content"]').contains(profileTag);

    // wait for nexus to index the profile tag before searching
    cy.wait(500);

    // open search results for the profile tag
    cy.visit(`/search?tags=${profileTag}`);
    cy.get('[data-cy="header-search"]').innerTextShouldContain(profileTag);

    // confirm the tagged profile is listed in the People section
    cy.get('[data-cy="search-people-section"]').should('be.visible').innerTextShouldContain(username);

    // no posts carry this tag
    cy.get('[data-cy="post-search-results"]').find('[data-cy="post-card"]').should('not.exist');
  });

  it('can search collections by tag', () => {
    const collectionTag = `collection-${uniqueId}`;
    const collectionName = `Searchable collection ${uniqueId}`;

    // create a collection and tag it from its hero
    goToCollectionsPage();
    createCollection(collectionName, 'Created to be found by tag search.');
    addTagsToCollectionHero([collectionTag]);

    // wait for nexus to index the collection tag before searching
    cy.wait(500);

    // open search results for the collection tag
    cy.visit(`/search?tags=${collectionTag}`);
    cy.get('[data-cy="header-search"]').innerTextShouldContain(collectionTag);

    // confirm the tagged collection is listed in the Collections section
    findCollectionCardInSection('[data-cy="search-collections-section"]', collectionName).should('be.visible');
  });
});
