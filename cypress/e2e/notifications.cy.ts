import { backupDownloadFilePath } from '../support/auth';
import {
  createQuickPost,
  createQuickPostWithMention,
  replyToPost,
  repostPost,
  deletePost,
  editPost,
  fastTagPostInFeed,
} from '../support/posts';
import { slowCypressDown } from 'cypress-slow-down';
import 'cypress-slow-down/commands';
import { searchAndFollowProfile, searchForProfileByPubky } from '../support/contacts';
import {
  clickFollowButton,
  checkLatestNotification,
  checkNotificationAt,
  addProfileTags,
  causeNotificationsToBeRead,
} from '../support/profile';
import {
  BackupType,
  CheckForNewPosts,
  HasBackedUp,
  LatestNotificationReadState,
  WaitForNewPosts,
} from '../support/types/enums';
import { verifyNotificationCounter } from '../support/common';
import {
  createCollection,
  createPostInCollection,
  deleteCollectionFromHero,
  findCollectionCardInSection,
  openCollectionFromMyCollections,
} from '../support/collections';
import { goToCollectionsPage, goToProfilePageFromHeader } from '../support/header';

const uniqueSuffix = String(Date.now()).slice(-5);

// Profiles use a unique suffix so @mention autocomplete does not match stale accounts from earlier runs.
// profile 1 and 2 are used for enabled notifications, profile 3 is used for disabled notifications
// todo: use space in username after bug fixed https://github.com/pubky/pubky-app/issues/1638
const profile1 = { username: `Notif#1${uniqueSuffix}`, pubkyAlias: 'pubky_1' };
const profile2 = { username: `Notif#2${uniqueSuffix}`, pubkyAlias: 'pubky_2' };
const profile3 = { username: `Notif#3${uniqueSuffix}`, pubkyAlias: 'pubky_3' };

describe('notifications', () => {
  before(() => {
    slowCypressDown();
    cy.deleteDownloadsFolder();

    // * create profile 1
    cy.onboardAsNewUser(profile1.username, '', [BackupType.EncryptedFile], profile1.pubkyAlias);
    cy.signOut(HasBackedUp.Yes);

    // * create profile 2
    cy.onboardAsNewUser(profile2.username, '', [BackupType.EncryptedFile], profile2.pubkyAlias);
    cy.signOut(HasBackedUp.Yes);

    // * create profile 3
    cy.onboardAsNewUser(profile3.username, '', [BackupType.EncryptedFile], profile3.pubkyAlias);
    cy.signOut(HasBackedUp.Yes);
  });

  beforeEach(() => {
    // Re-create the aliases in beforeEach
    cy.log('Re-creating aliases in beforeEach');
    cy.wrap(Cypress.expose(profile1.pubkyAlias)).as(profile1.pubkyAlias);
    cy.wrap(Cypress.expose(profile2.pubkyAlias)).as(profile2.pubkyAlias);
    cy.wrap(Cypress.expose(profile3.pubkyAlias)).as(profile3.pubkyAlias);

    // sign in if not already
    cy.location('pathname').then((currentPath) => {
      if (currentPath !== '/home') {
        cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
      }
    });
  });

  it('can be notified for new follower and friend', () => {
    // * profile 1 follows profile 2
    cy.get(`@${profile2.pubkyAlias}`).then((pubky) => {
      searchAndFollowProfile(`${pubky}`, profile2.username);
    });

    // * profile 2 checks notification for new follower
    cy.signOut(HasBackedUp.Yes);

    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    verifyNotificationCounter(1);
    cy.intercept({
      method: 'PUT',
      url: '/pub/pubky.app/last_read',
    }).as('putLastRead');
    goToProfilePageFromHeader();
    cy.wait('@putLastRead').should('have.property', 'response').its('statusCode').should('eq', 201);
    verifyNotificationCounter(0);
    // check latest notification on profile page and navigate to profile 1 profile page
    checkLatestNotification([profile1.username, 'followed you'], LatestNotificationReadState.Unread, profile1.username);

    // * profile 2 follows profile 1
    clickFollowButton();

    // * profile 1 checks notification for new friend
    cy.signOut(HasBackedUp.Yes);

    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    verifyNotificationCounter(1);
    goToProfilePageFromHeader();
    verifyNotificationCounter(0);
    // check latest notification on profile page
    checkLatestNotification([profile2.username, 'is now your friend'], LatestNotificationReadState.Unread);

    // * toggle tabs to check unread dot disappears
    causeNotificationsToBeRead();
    verifyNotificationCounter(0);
    checkLatestNotification([profile2.username, 'is now your friend'], LatestNotificationReadState.Read);
  });

  it('can be notified for tagged post and profile', () => {
    // helper function to verify the tag is visible on desktop and not on mobile
    const expectLatestNotificationTag = (tagLabel: string) => {
      const isMobile = Cypress.expose('isMobile');
      cy.get('[data-cy="notifications-list"]')
        .children()
        .first()
        .find('[data-cy="post-tag"]')
        .should(isMobile ? 'not.be.visible' : 'be.visible')
        .then(($tag) => {
          if (!isMobile) {
            cy.wrap($tag).should('contain', tagLabel);
          }
        });
    };

    // * profile 1 creates a post
    const postContent = `I will be notified when this post is tagged! ${Date.now()}`;
    createQuickPost(postContent);

    // * profile 1 tags profile 2's profile
    cy.get(`@${profile2.pubkyAlias}`).then((pubky) => {
      searchForProfileByPubky(`${pubky}`, profile2.username);
    });

    // add one tag to profile
    cy.get('[data-cy="profile-tag-btn"]').click();
    const profileTag = 'nice';
    addProfileTags([profileTag]);

    // * profile 2 checks for notification for tagged profile
    cy.signOut(HasBackedUp.Yes);

    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    verifyNotificationCounter(1);
    goToProfilePageFromHeader();
    verifyNotificationCounter(0);
    // check latest notification on profile page
    checkLatestNotification([profile1.username, 'tagged your profile'], LatestNotificationReadState.Unread);

    expectLatestNotificationTag(profileTag);

    // * profile 2 tags profile 1's post (from their profile page)
    cy.get(`@${profile1.pubkyAlias}`).then((pubky) => {
      searchForProfileByPubky(`${pubky}`, profile1.username);
    });
    verifyNotificationCounter(0);
    // click Posts tab to show profile 1's posts
    cy.get('[data-cy="profile-filter-item-posts"]').click();
    cy.get('[data-cy="profile-filter-item-posts"]').closest('[data-selected="true"]').should('exist');
    const postTag = 'first-world-problem';
    // tag the first post on profile 1's profile
    fastTagPostInFeed([postTag], postContent);

    // * profile 1 checks for notification for tagged post
    cy.signOut(HasBackedUp.Yes);

    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    verifyNotificationCounter(1);
    goToProfilePageFromHeader();
    verifyNotificationCounter(0);
    checkLatestNotification([profile2.username, 'tagged your post'], LatestNotificationReadState.Unread);

    // * toggle tabs to check unread dot disappears
    causeNotificationsToBeRead();
    verifyNotificationCounter(0);
    checkLatestNotification([profile2.username, 'tagged your post'], LatestNotificationReadState.Read);

    // verify post tag is visible on desktop and not on mobile
    expectLatestNotificationTag(postTag);

    // verify navigation to search page with tag on desktop post page on mobile
    if (Cypress.expose('isMobile')) {
      cy.get('[data-cy="notifications-list"]').children().first().contains('a', 'tagged your post').click();
      cy.location('pathname').should('match', /^\/post\/[^/]+\/[^/]+$/);
    } else {
      cy.get('[data-cy="notifications-list"]').children().first().find('[data-cy="post-tag"]').click();
      cy.location('pathname').should('eq', '/search');
      cy.location('search').should('eq', '?tags=first-world-problem');
    }
  });

  it('can be notified for profile being mentioned in a post', () => {
    // * profile 1 creates a post mentioning profile 2 via @username lookup
    createQuickPostWithMention(profile2.username);

    // * profile 2 checks for notification for being mentioned
    cy.signOut(HasBackedUp.Yes);

    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    verifyNotificationCounter(1);
    goToProfilePageFromHeader();
    verifyNotificationCounter(0);
    checkLatestNotification([profile1.username, 'mentioned you in post'], LatestNotificationReadState.Unread);

    // * toggle tabs to check unread dot disappears
    causeNotificationsToBeRead();
    verifyNotificationCounter(0);
    checkLatestNotification([profile1.username, 'mentioned you in post'], LatestNotificationReadState.Read);
  });

  it('can disable being notified for profile being mentioned in a post', () => {
    // * profile 3 signs in and disables mention notifications
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile3.username));
    cy.get('[data-cy="header-settings-btn"]').click();
    cy.location('pathname').should('eq', '/settings/account');
    cy.get('[data-cy="settings-menu-item-notifications"]').click();
    cy.location('pathname').should('eq', '/settings/notifications');
    cy.get('#notification-switch-mention').click();

    // * profile 1 signs in and creates a post mentioning profile 3 via @username lookup
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    createQuickPostWithMention(profile3.username);

    // * profile 3 checks for absence of notification for being mentioned
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile3.username));
    verifyNotificationCounter(0);
    goToProfilePageFromHeader();
    cy.get('[data-cy="profile-tab-content"]').should('contain.text', 'No notifications yet');
  });

  it('can be notified for your post being replied to', () => {
    // * profile 1 creates a post (1)
    const postContent = `I will be notified when this post is replied to! ${Date.now()}`;
    createQuickPost(postContent);

    // * profile 2 replies to profile 1's post (1)
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    replyToPost({ replyContent: 'I replied to your post!', filterText: postContent });

    // * profile 1 checks for notification for being replied to
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    verifyNotificationCounter(1);
    goToProfilePageFromHeader();
    verifyNotificationCounter(0);
    checkLatestNotification([profile2.username, 'replied to your post'], LatestNotificationReadState.Unread);

    // * toggle tabs to check unread dot disappears
    causeNotificationsToBeRead();
    verifyNotificationCounter(0);
    checkLatestNotification([profile2.username, 'replied to your post'], LatestNotificationReadState.Read);
  });

  it('can be notified for your post being reposted', () => {
    // * profile 1 creates a post (1)
    const postContent = `I will be notified when this post is reposted! ${Date.now()}`;
    createQuickPost(postContent);

    // * profile 2 reposts profile 1's post (1)
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    // wait for new posts to be indexed and click 'See new posts' button
    cy.findFirstPostInFeedFiltered(postContent, CheckForNewPosts.Yes);
    repostPost({ filterText: postContent, repostContent: 'I reposted your post!' });

    // * profile 1 checks for notification for being reposted
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    verifyNotificationCounter(1);
    goToProfilePageFromHeader();
    verifyNotificationCounter(0);
    checkLatestNotification([profile2.username, 'reposted your post'], LatestNotificationReadState.Unread);

    // * toggle tabs to check unread dot disappears
    causeNotificationsToBeRead();
    verifyNotificationCounter(0);
    checkLatestNotification([profile2.username, 'reposted your post'], LatestNotificationReadState.Read);
  });

  it('can be notified for a post being deleted that you replied to', () => {
    // * profile 1 creates a post (1) that will be replied to and then deleted
    const postContent = `The one who replies to this post will be notified when it is deleted! ${Date.now()}`;
    createQuickPost(postContent);

    // * profile 2 replies to profile 1's post (1)
    cy.signOut(HasBackedUp.Yes);
    //cy.clearAllSessionStorage();
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    replyToPost({ replyContent: 'I replied to your post!', filterText: postContent });

    // * profile 1 deletes own post (1)
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    // Go to profile page and click Posts tab to see own posts (home feed shows followed users' posts)
    goToProfilePageFromHeader();
    cy.get('[data-cy="profile-filter-item-posts"]').click();
    cy.get('[data-cy="profile-filter-item-posts"]').closest('[data-selected="true"]').should('exist');
    deletePost({ postIdx: 0, filterText: postContent });

    // * profile 2 checks for notification for post (1) being deleted
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    verifyNotificationCounter(1);
    goToProfilePageFromHeader();
    verifyNotificationCounter(0);
    checkLatestNotification([profile1.username, 'deleted a post'], LatestNotificationReadState.Unread);

    // * toggle tabs to check unread dot disappears
    causeNotificationsToBeRead();
    verifyNotificationCounter(0);
    checkLatestNotification([profile1.username, 'deleted a post'], LatestNotificationReadState.Read);
  });

  it('groups notifications for posts being deleted that you reposted', () => {
    // * profile 1 creates two posts that will be reposted and then deleted. Two posts
    // make the test self-contained: it forms a grouped row on its own, so it also passes
    // in isolation. The copy assertions stay count-agnostic because earlier deletions by
    // profile 1 (from the preceding test, or Cypress retries) join the same run.
    const timestamp = Date.now();
    const firstPostContent = `The one who reposts this post will be notified when it is deleted! ${timestamp}`;
    const secondPostContent = `Repost this one too and hear about its deletion as well! ${timestamp}`;
    createQuickPost(firstPostContent);
    createQuickPost(secondPostContent);

    // * profile 2 reposts both of profile 1's posts
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    // The newest post visible in the feed proves both have been indexed.
    cy.findFirstPostInFeed().innerTextContains(secondPostContent);
    repostPost({ repostContent: 'I reposted your post!', filterText: firstPostContent });
    repostPost({ repostContent: 'I reposted this one as well!', filterText: secondPostContent });

    // * profile 1 deletes both own posts
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    // Go to profile page and click Posts tab to see own posts (home feed shows followed users' posts)
    goToProfilePageFromHeader();
    cy.get('[data-cy="profile-filter-item-posts"]').click();
    cy.get('[data-cy="profile-filter-item-posts"]').closest('[data-selected="true"]').should('exist');
    deletePost({ postIdx: 0, filterText: firstPostContent });
    deletePost({ postIdx: 0, filterText: secondPostContent });

    // * profile 2 checks for the grouped deletion notification
    // (see https://github.com/pubky/pubky-app/issues/1570)
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    verifyNotificationCounter(2);
    goToProfilePageFromHeader();
    verifyNotificationCounter(0);
    // 'posts you interacted with' is the grouped copy; a lone row says 'deleted a post'.
    checkLatestNotification(
      [profile1.username, 'deleted', 'posts you interacted with'],
      LatestNotificationReadState.Unread,
    );
    cy.get('[data-cy="notifications-list"]').children().first().should('have.attr', 'data-cy', 'notification-group');

    // * toggle tabs to check unread dot disappears
    causeNotificationsToBeRead();
    verifyNotificationCounter(0);
    checkLatestNotification(
      [profile1.username, 'deleted', 'posts you interacted with'],
      LatestNotificationReadState.Read,
    );
  });

  it('can be notified for a post being edited that you replied to', () => {
    // * profile 1 creates a post (1) that will be replied to and then edited
    const postContent = `The one who replies to this post will be notified when it is edited! ${Date.now()}`;
    const editedContent = `This post has been edited! ${Date.now()}`;
    createQuickPost(postContent);

    // * profile 2 replies to profile 1's post (1)
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    replyToPost({ replyContent: 'I replied to your post!', filterText: postContent });

    // * profile 1 edits own post (1)
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    goToProfilePageFromHeader();
    cy.get('[data-cy="profile-filter-item-posts"]').click();
    cy.get('[data-cy="profile-filter-item-posts"]').closest('[data-selected="true"]').should('exist');
    editPost({ newPostContent: editedContent, postIdx: 0, filterText: postContent });

    // * profile 2 checks for notification for post (1) being edited
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    verifyNotificationCounter(1);
    goToProfilePageFromHeader();
    verifyNotificationCounter(0);
    checkLatestNotification([profile1.username, 'edited a post'], LatestNotificationReadState.Unread);

    // * toggle tabs to check unread dot disappears
    causeNotificationsToBeRead();
    verifyNotificationCounter(0);
    checkLatestNotification([profile1.username, 'edited a post'], LatestNotificationReadState.Read);
  });

  it('groups notifications for posts being edited that you reposted', () => {
    // * profile 1 creates two posts that will be reposted and then edited. Two distinct
    // posts make the test self-contained: they form a grouped row on their own (repeated
    // edits of one post deduplicate instead), so the test also passes in isolation. The
    // copy assertions stay count-agnostic because earlier edits by profile 1 (from the
    // preceding test, or Cypress retries) join the same run.
    const timestamp = Date.now();
    const firstPostContent = `The one who reposts this post will be notified when it is edited! ${timestamp}`;
    const secondPostContent = `Repost this one too and hear about its edit as well! ${timestamp}`;
    createQuickPost(firstPostContent);
    createQuickPost(secondPostContent);

    // * profile 2 reposts both of profile 1's posts
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    // The newest post visible in the feed proves both have been indexed.
    cy.findFirstPostInFeed().innerTextContains(secondPostContent);
    repostPost({ repostContent: 'I reposted your post!', filterText: firstPostContent });
    repostPost({ repostContent: 'I reposted this one as well!', filterText: secondPostContent });

    // * profile 1 edits both own posts
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    goToProfilePageFromHeader();
    cy.get('[data-cy="profile-filter-item-posts"]').click();
    cy.get('[data-cy="profile-filter-item-posts"]').closest('[data-selected="true"]').should('exist');
    editPost({ newPostContent: `This post has been edited! ${timestamp}`, postIdx: 0, filterText: firstPostContent });
    editPost({
      newPostContent: `This post has also been edited! ${timestamp}`,
      postIdx: 0,
      filterText: secondPostContent,
    });

    // * profile 2 checks for the grouped edit notification, which keeps a link to every
    // edited post (see issue #1570)
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    verifyNotificationCounter(2);
    goToProfilePageFromHeader();
    verifyNotificationCounter(0);
    // 'posts you interacted with' is the grouped copy; a lone row says 'edited a post'.
    checkLatestNotification(
      [profile1.username, 'edited', 'posts you interacted with'],
      LatestNotificationReadState.Unread,
    );

    // * every edited post sits behind the Show/Hide disclosure on desktop, while mobile
    // renders the title list permanently without a toggle
    cy.get('[data-cy="notifications-list"]').children().first().as('editedGroup');
    if (Cypress.expose('isMobile')) {
      cy.get('@editedGroup').find('[data-cy="notification-group-toggle"]').should('not.exist');
      cy.get('@editedGroup').find('[data-cy="notification-group-item"]').should('have.length.at.least', 2);
    } else {
      cy.get('@editedGroup').find('[data-cy="notification-group-toggle"]').should('contain.text', 'Show');
      cy.get('@editedGroup').find('[data-cy="notification-group-item"]').should('have.length', 0);
      cy.get('@editedGroup').find('[data-cy="notification-group-toggle"]').click();
      cy.get('@editedGroup').find('[data-cy="notification-group-item"]').should('have.length.at.least', 2);
      cy.get('@editedGroup').find('[data-cy="notification-group-toggle"]').should('contain.text', 'Hide');
    }

    // * toggle tabs to check unread dot disappears
    causeNotificationsToBeRead();
    verifyNotificationCounter(0);
    checkLatestNotification(
      [profile1.username, 'edited', 'posts you interacted with'],
      LatestNotificationReadState.Read,
    );
  });

  it('can be notified when a followed collection is updated with a new post', () => {
    const DISCOVER_SECTION = '[data-cy="discover-collections-section"]';
    const FOLLOWED_SECTION = '[data-cy="followed-collections-section"]';
    const collectionName = `Notif collection ${Date.now()}`;
    const seedPostContent = `Seed post for followed collection ${Date.now()}`;
    const addedPostContent = `Post added after follow ${Date.now()}`;

    // * profile 1 creates a collection with a seed post so it is discoverable
    goToCollectionsPage();
    createCollection(collectionName, 'Follow me for collection update notifications.');
    createPostInCollection(seedPostContent);
    // wait for nexus to index the collection as discoverable
    cy.wait(1000);
    cy.signOut(HasBackedUp.Yes);

    // * profile 2 discovers the collection and follows it from the dedicated page header
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    goToCollectionsPage();
    findCollectionCardInSection(DISCOVER_SECTION, collectionName).should('be.visible');
    cy.intercept('PUT', '**/pub/pubky.app/bookmarks/**').as('followCollection');
    findCollectionCardInSection(DISCOVER_SECTION, collectionName).click();
    cy.location('pathname').should('match', /^\/collections\/[^/]+\/[^/]+$/);
    cy.get('[data-cy="collection-hero-follow-btn"]').should('contain.text', 'Follow').click();
    cy.wait('@followCollection').its('response.statusCode').should('eq', 201);
    goToCollectionsPage();
    findCollectionCardInSection(FOLLOWED_SECTION, collectionName).should('be.visible');

    // * profile 1 adds a new post to the followed collection
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    openCollectionFromMyCollections(collectionName);
    createPostInCollection(addedPostContent);

    // * profile 2 checks for notification that the collection was updated
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    verifyNotificationCounter(1);
    goToProfilePageFromHeader();
    verifyNotificationCounter(0);
    checkLatestNotification([profile1.username, 'updated collection'], LatestNotificationReadState.Unread);

    // * toggle tabs to check unread dot disappears
    causeNotificationsToBeRead();
    verifyNotificationCounter(0);
    checkLatestNotification([profile1.username, 'updated collection'], LatestNotificationReadState.Read);

    // clean up so the collection does not linger in Discover for later runs/retries
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    openCollectionFromMyCollections(collectionName);
    deleteCollectionFromHero();
  });

  it('can display counter for multiple new notifications', () => {
    // * profile 1 creates a post
    const postContent = `I will get three notifications about this post! ${Date.now()}`;
    createQuickPost(postContent);

    // * profile 2 tags the post, replies to it, and creates a post mentioning profile 1
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    cy.findFirstPostInFeedFiltered(postContent, CheckForNewPosts.Yes);
    fastTagPostInFeed(['multi-notif'], postContent);
    replyToPost({ replyContent: 'Replying for a second notification!', filterText: postContent });
    createQuickPostWithMention(profile1.username);

    // * profile 1 checks the counter shows 3 and all three notifications are listed
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    verifyNotificationCounter(3);
    goToProfilePageFromHeader();
    verifyNotificationCounter(0);
    cy.get('[data-cy="notifications-list"]').children().should('have.length.at.least', 3);
    // newest first: mention, then reply, then tag
    checkNotificationAt(0, [profile2.username, 'mentioned you in post'], LatestNotificationReadState.Unread);
    checkNotificationAt(1, [profile2.username, 'replied to your post'], LatestNotificationReadState.Unread);
    checkNotificationAt(2, [profile2.username, 'tagged your post'], LatestNotificationReadState.Unread);
  });
});
