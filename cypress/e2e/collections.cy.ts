import { backupDownloadFilePath } from '../support/common';
import { slowCypressDown } from 'cypress-slow-down';
// registers the cy.slowDown and cy.slowDownEnd commands
import 'cypress-slow-down/commands';
import {
  ADD_CONTENT_URL_DUPLICATE_ERROR,
  ADD_CONTENT_URL_INVALID_ERROR,
  addPostToCollectionByUrl,
  addPostToCollectionByUrlExpectingError,
  addTagsToCollectionHero,
  applyContentFilter,
  collectionCounterEq,
  createCollection,
  createCollectionFromSavePicker,
  createPostInCollection,
  deleteCollectionFromHero,
  editCollectionFromHero,
  findCollectionCardInSection,
  openCollectionFromMyCollections,
  selectCollectionViewerLayout,
  sectionDoesNotContainCollection,
  togglePostInCollectionViaSavePicker,
} from '../support/collections';
import { searchForProfileByPubky } from '../support/contacts';
import { goToCollectionsPage, goToHomePage } from '../support/header';
import { createQuickPost, replyToPost, waitForFeedToLoad } from '../support/posts';
import { defaultMs } from '../support/slow-down';
import { BackupType, CheckForNewPosts, HasBackedUp, WaitForNewPosts } from '../support/types/enums';

const MY_SECTION = '[data-cy="my-collections-section"]';
const FOLLOWED_SECTION = '[data-cy="followed-collections-section"]';
const DISCOVER_SECTION = '[data-cy="discover-collections-section"]';

const curator = {
  username: 'Curator',
  bio: 'I curate the finest collections.',
  pubkyAlias: 'curator_pubky',
  postText1: `Curator's first post ${Date.now()}`,
  postText2: `Curator's second post ${Date.now()}`,
  postText3: `Curator's third post ${Date.now()}`,
};

const follower = {
  username: 'Follower',
  bio: 'I follow the finest collections.',
};

describe('collections', () => {
  before(() => {
    slowCypressDown();
    cy.deleteDownloadsFolder();

    // create the curator profile and a few posts to curate
    cy.onboardAsNewUser(curator.username, curator.bio, [BackupType.EncryptedFile], curator.pubkyAlias);
    createQuickPost(curator.postText1);
    createQuickPost(curator.postText2);
    createQuickPost(curator.postText3);
    cy.signOut(HasBackedUp.Yes);

    // create the follower profile
    cy.onboardAsNewUser(follower.username, follower.bio, [BackupType.EncryptedFile]);
    cy.signOut(HasBackedUp.Yes);
  });

  beforeEach(() => {
    // in case it gets changed by a test and not reset
    cy.slowDown(defaultMs);

    // re-create aliases because they are cleared at the end of each test
    cy.wrap(Cypress.expose(curator.pubkyAlias)).as(curator.pubkyAlias);

    // sign in as the curator if not already signed in
    cy.location('pathname').then((currentPath) => {
      if (currentPath !== '/home') {
        cy.signInWithEncryptedFile(backupDownloadFilePath(curator.username));
      }
    });
  });

  it('can create, edit and populate a collection, verify feed visibility, then remove a post and delete it', () => {
    const originalName = `Original name ${Date.now()}`;
    const originalDescription = 'The original description.';
    const editedName = `Proof of Work ${Date.now()}`;
    const editedDescription = 'The best posts, curated by e2e.';
    const tags = ['bitcoin', 'nostalgia'];
    const createdPostContent = `Created from the Add Post dialog! ${Date.now()}`;

    // capture the URL of the post that will be added by URL later
    cy.findFirstPostInFeedFiltered(curator.postText2, CheckForNewPosts.No, WaitForNewPosts.Yes).within(() => {
      cy.get('[data-cy="post-text"]').click();
    });
    cy.location('pathname').should('contain', '/post/');
    cy.url().as('post2Url');
    goToHomePage();

    // * create the collection with a name and description, then tag it
    goToCollectionsPage();
    createCollection(originalName, originalDescription);
    addTagsToCollectionHero(tags);

    // * edit the collection name and description; the hero updates and survives a reload
    editCollectionFromHero(editedName, editedDescription);
    cy.reload();
    cy.get('[data-cy="collection-hero"]').should('contain.text', editedName);
    cy.get('[data-cy="collection-hero"]').should('contain.text', editedDescription);
    tags.forEach((tag) => {
      cy.get('[data-cy="collection-hero"]').contains('button', tag).should('be.visible');
    });

    // * add post 1 of 3 from the feed via the post's save picker,
    // entered through the Add Post dialog's highlighted save pill
    cy.get('[data-cy="collection-add-content"]').click();
    cy.get('[data-cy="add-content-feed-save-pill"]').should('be.visible').click();
    cy.location('pathname').should('eq', '/home');
    waitForFeedToLoad();
    togglePostInCollectionViaSavePicker(curator.postText1, editedName);

    openCollectionFromMyCollections(editedName);
    // todo: remove reload workaround for bug https://github.com/pubky/pubky-app/issues/2235
    cy.reload();
    cy.get('[data-cy="timeline-posts-grid"]').should('contain.text', curator.postText1);
    collectionCounterEq(1);

    // * add post 2 of 3 by pasting its URL in the Add Post dialog
    cy.get('@post2Url').then((url) => addPostToCollectionByUrl(String(url)));
    cy.get('[data-cy="timeline-posts-grid"]').should('contain.text', curator.postText2);
    collectionCounterEq(2);

    // * an invalid URL is rejected with a validation error
    addPostToCollectionByUrlExpectingError('https://example.com/not-a-post', ADD_CONTENT_URL_INVALID_ERROR);
    collectionCounterEq(2);

    // * a URL of a post already in the collection is rejected
    cy.get('@post2Url').then((url) => {
      addPostToCollectionByUrlExpectingError(String(url), ADD_CONTENT_URL_DUPLICATE_ERROR);
    });
    collectionCounterEq(2);
    cy.get('[data-cy="timeline-posts-grid"]').find('[data-cy="post-card"]').should('have.length', 2);

    // * add post 3 of 3 by creating a brand new post from the Add Post dialog
    createPostInCollection(createdPostContent);
    cy.get('[data-cy="timeline-posts-grid"]').should('contain.text', createdPostContent);
    cy.get('[data-cy="timeline-posts-grid"]').find('[data-cy="post-card"]').should('have.length', 3);
    collectionCounterEq(3);

    // * the collection is not shown in the global feed (only its posts are)
    goToHomePage();
    cy.get('[data-cy="timeline-posts"]').should('not.contain.text', editedName);
    cy.findFirstPostInFeedFiltered(curator.postText1).should('be.visible');
    cy.findFirstPostInFeedFiltered(curator.postText2).should('be.visible');
    cy.findFirstPostInFeedFiltered(createdPostContent).should('be.visible');

    // * the collection is shown in the feed when the Collections content filter is applied
    applyContentFilter('Collections');
    cy.get('[data-cy="timeline-posts"]').should('contain.text', editedName);
    applyContentFilter('All');

    // * remove one post from the collection via the post's save picker in the feed
    togglePostInCollectionViaSavePicker(curator.postText1, editedName);
    openCollectionFromMyCollections(editedName);
    // todo: remove reload workaround for bug https://github.com/pubky/pubky-app/issues/2235
    cy.reload();
    cy.get('[data-cy="timeline-posts-grid"]').should('not.contain.text', curator.postText1);
    cy.get('[data-cy="timeline-posts-grid"]').find('[data-cy="post-card"]').should('have.length', 2);
    collectionCounterEq(2);

    // * delete the whole collection via the hero bin icon
    deleteCollectionFromHero();
    cy.get(MY_SECTION).should('not.contain.text', editedName);

    goToHomePage();
  });

  it('another user can discover, follow, view on profile, and unfollow a collection', () => {
    const collectionName = `Discoverable gems ${Date.now()}`;

    // * as the curator, create a collection with one post
    goToCollectionsPage();
    createCollection(collectionName, 'Waiting to be discovered.');
    goToHomePage();
    togglePostInCollectionViaSavePicker(curator.postText3, collectionName);
    // wait for nexus to index the collection as discoverable
    cy.wait(1000);
    cy.signOut(HasBackedUp.Yes);

    // * as the follower, the collection appears in Discover Collections
    cy.signInWithEncryptedFile(backupDownloadFilePath(follower.username));
    goToCollectionsPage();
    findCollectionCardInSection(DISCOVER_SECTION, collectionName).should('be.visible');

    // * follow the collection from its discover card
    cy.intercept('PUT', '**/pub/pubky.app/bookmarks/**').as('followCollection');
    findCollectionCardInSection(DISCOVER_SECTION, collectionName)
      .find('[data-cy="collection-card-follow-btn"]')
      .click();
    cy.wait('@followCollection').its('response.statusCode').should('eq', 201);

    // * the collection moves to Followed Collections and leaves Discover Collections
    findCollectionCardInSection(FOLLOWED_SECTION, collectionName).should('be.visible');
    sectionDoesNotContainCollection(DISCOVER_SECTION, collectionName);

    // * the followed collection contains the correct post and its hero offers Unfollow
    findCollectionCardInSection(FOLLOWED_SECTION, collectionName).click();
    cy.location('pathname').should('match', /^\/collections\/[^/]+\/[^/]+$/);
    // todo: remove reload workaround for bug https://github.com/pubky/pubky-app/issues/2235
    cy.reload();
    cy.get('[data-cy="timeline-posts-grid"]').should('contain.text', curator.postText3);
    cy.get('[data-cy="collection-hero-follow-btn"]').should('contain.text', 'Unfollow');

    // * the collection is listed on the curator's profile Collections tab
    cy.get(`@${curator.pubkyAlias}`).then((pubky) => {
      searchForProfileByPubky(String(pubky), curator.username);
    });
    cy.get('[data-cy="profile-filter-item-collections"]').click();
    cy.location('pathname').should('match', /^\/profile\/[^/]+\/collections$/);
    cy.get('[data-cy="profile-filter-item-collections-count"]')
      .invoke('text')
      .then((text) => {
        expect(Number(text), 'profile collections count').to.be.at.least(1);
      });
    cy.contains('[data-cy="collection-card"]', collectionName).should('be.visible');

    // * unfollowing returns the collection to Discover Collections
    goToCollectionsPage();
    cy.intercept('DELETE', '**/pub/pubky.app/bookmarks/**').as('unfollowCollection');
    findCollectionCardInSection(FOLLOWED_SECTION, collectionName)
      .find('[data-cy="collection-card-follow-btn"]')
      .click();
    cy.wait('@unfollowCollection').its('response.statusCode').should('eq', 204);
    sectionDoesNotContainCollection(FOLLOWED_SECTION, collectionName);
    // todo: remove reload workaround for bug https://github.com/pubky/pubky-app/issues/2237
    cy.reload();
    findCollectionCardInSection(DISCOVER_SECTION, collectionName).should('be.visible');

    cy.signOut(HasBackedUp.Yes);

    // clean up the curator's collection so it does not linger in Discover for later runs/retries
    cy.signInWithEncryptedFile(backupDownloadFilePath(curator.username));
    openCollectionFromMyCollections(collectionName);
    deleteCollectionFromHero();
    cy.signOut(HasBackedUp.Yes);
  });

  it('shows the collections intro the first time a user creates a collection', () => {
    const collectionName = `First collection ${Date.now()}`;

    // beforeEach signs in as the curator, who may already have collections — use a fresh user
    cy.signOut(HasBackedUp.Yes);
    cy.onboardAsNewUser('Intro Newbie', 'I have never made a collection.', [BackupType.EncryptedFile]);

    goToCollectionsPage();
    createCollection(collectionName, 'Seen the welcome intro.', { expectIntro: true });

    // * a second create skips the intro and opens the form directly
    goToCollectionsPage();
    cy.get('[data-cy="new-collection-card-cta"]').click();
    cy.get('[data-cy="collections-intro-continue"]').should('not.exist');
    cy.get('[data-cy="collection-form-name-input"]').should('be.visible');
    cy.get('[data-testid="dialog-close"]').click();
    cy.get('[data-cy="dialog-content"]').should('not.exist');

    // clean up so the collection does not linger in other users' Discover section
    openCollectionFromMyCollections(collectionName);
    deleteCollectionFromHero();
    cy.signOut(HasBackedUp.Yes);
  });

  it('persists the creator List default and keeps viewer overrides temporary', () => {
    const collectionName = `List collection ${Date.now()}`;
    const postContent = `A post in List layout ${Date.now()}`;
    const replyContent = `A reply hidden from the collection ${Date.now()}`;

    goToHomePage();
    cy.get('[data-cy="columns-layout-toggle"]').filter(':visible').click();
    goToCollectionsPage();
    createCollection(collectionName, 'List by default.', { layout: 'list' });
    createPostInCollection(postContent);
    replyToPost({ replyContent, filterText: postContent });

    cy.get('[data-cy="timeline-posts"]').should('contain.text', postContent);
    cy.get('[data-cy="timeline-posts"]').should('not.contain.text', replyContent);
    cy.get('[data-cy="timeline-posts-grid"]').should('not.exist');
    cy.get('[data-cy="collection-layout-menu"]').should('not.exist');

    // * posts opened from List collections use the Home layout and reveal their replies
    cy.get('[data-cy="timeline-posts"]').contains(postContent).click();
    cy.location('pathname').should('match', /^\/post\/[^/]+\/[^/]+$/);
    cy.location('search').should('eq', '');
    cy.get('[data-cy="single-post-card"]').should('contain.text', postContent);
    cy.contains(replyContent).should('be.visible');
    cy.get('[data-cy="columns-layout-toggle"]').filter(':visible').should('have.attr', 'aria-checked', 'true');

    // * changing the post layout updates Home state without adding another Back step
    cy.get('[data-cy="wide-layout-toggle"]').filter(':visible').click();
    cy.location('search').should('eq', '');
    cy.get('[data-cy="wide-layout-toggle"]').filter(':visible').should('have.attr', 'aria-checked', 'true');
    cy.go('back');
    cy.get('[data-cy="timeline-posts"]').should('contain.text', postContent);
    cy.get('[data-cy="timeline-posts"]').should('not.contain.text', replyContent);

    // * a viewer can override the creator default without persisting it
    cy.wait(1000);
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(follower.username));
    goToCollectionsPage();
    findCollectionCardInSection(DISCOVER_SECTION, collectionName).should('be.visible').click();
    selectCollectionViewerLayout('grid');
    cy.get('[data-cy="timeline-posts-grid"]').should('contain.text', postContent);

    cy.reload();
    cy.get('[data-cy="timeline-posts"]').should('contain.text', postContent);
    cy.get('[data-cy="timeline-posts-grid"]').should('not.exist');

    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(curator.username));
    openCollectionFromMyCollections(collectionName);
    deleteCollectionFromHero();
    goToHomePage();
  });

  it('can create a collection with a post directly from the save picker', () => {
    const collectionName = `Picker made ${Date.now()}`;
    const postContent = `This post starts a brand new collection! ${Date.now()}`;

    createQuickPost(postContent);
    createCollectionFromSavePicker(postContent, collectionName);

    // * the new collection is listed in My Collections and contains the post
    goToCollectionsPage();
    findCollectionCardInSection(MY_SECTION, collectionName).should('be.visible').click();
    cy.location('pathname').should('match', /^\/collections\/[^/]+\/[^/]+$/);
    cy.get('[data-cy="timeline-posts-grid"]').should('contain.text', postContent);
    collectionCounterEq(1);

    // clean up so the collection does not linger in other users' Discover section
    deleteCollectionFromHero();
    goToHomePage();
  });

  it('can share a collection and navigate to it from the shared post in the feed', () => {
    const collectionName = `Share worthy ${Date.now()}`;
    const postContent = `A post worth sharing! ${Date.now()}`;
    const shareComment = `Sharing my collection! ${Date.now()}`;

    // * create a collection with one post
    goToCollectionsPage();
    createCollection(collectionName, 'Made to be shared.');
    createPostInCollection(postContent);
    collectionCounterEq(1);

    // * share the collection from its hero
    cy.get('[data-cy="collection-hero-share-btn"]').click();
    cy.get('[data-cy="repost-post-input"]')
      .should('be.visible')
      .within(() => {
        cy.get('textarea').should('have.value', '').type(shareComment);
        cy.intercept('PUT', '**/pub/pubky.app/posts/**').as('collectionShared');
        cy.get('[data-cy="post-input-action-bar-share"]').click();
        cy.wait('@collectionShared').its('response.statusCode').should('eq', 201);
      });
    cy.get('[data-cy="repost-post-input"]').should('not.exist');

    // * the shared post appears in the feed containing the collection preview
    goToHomePage();
    cy.findFirstPostInFeedFiltered(shareComment, CheckForNewPosts.No, WaitForNewPosts.Yes).within(() => {
      cy.contains('[data-cy="collection-card"]', collectionName).should('be.visible');
    });

    // * a single click on the collection preview navigates to the collection page
    cy.findFirstPostInFeedFiltered(shareComment).within(() => {
      cy.contains('[data-cy="collection-card"]', collectionName).click();
    });
    cy.location('pathname').should('match', /^\/collections\/[^/]+\/[^/]+$/);
    cy.get('[data-cy="collection-hero"]').should('contain.text', collectionName);

    // clean up so the collection does not linger in other users' Discover section
    deleteCollectionFromHero();
    goToHomePage();
  });
});
