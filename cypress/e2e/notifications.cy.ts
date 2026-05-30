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
import { goToProfilePageFromHeader } from '../support/header';

const uniqueSuffix = String(Date.now()).slice(-5);

// profile 1 and 2 are used for enabled notifications, profile 3 is used for disabled notifications
const profile1 = { username: 'Notif #1', pubkyAlias: 'pubky_1' };
// profile 2 and 3 have a unique suffix to avoid conflicts when mentioning profile 2 and 3 in new posts across test runs
// todo: use space in username after bug fixed https://github.com/pubky/pubky-app/issues/1638
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

    // TODO: add checks for disabled notifications
    // * profile 1 disables follow notifications
    // * profile 2 disables friend notifications
    // * profile 2 follows profile 1
    // * profile 1 checks absence of notifications
    // * profile 1 follows profile 2
    // * profile 2 checks for follow notification? and absence of friend notification
  });

  it('can be notified for tagged post and profile', () => {
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
    checkLatestNotification([profile1.username, 'tagged your profile', profileTag], LatestNotificationReadState.Unread);

    // * profile 2 tags profile 1's post (from their profile page)
    cy.get(`@${profile1.pubkyAlias}`).then((pubky) => {
      searchForProfileByPubky(`${pubky}`, profile1.username);
    });
    verifyNotificationCounter(0);
    // click Posts tab to show profile 1's posts
    cy.get('[data-cy="profile-filter-item-posts"]').click();
    cy.get('[data-cy="profile-filter-item-posts"]').closest('[data-selected="true"]').should('exist');
    const postTag = 'ilike';
    // tag the first post on profile 1's profile
    fastTagPostInFeed([postTag], postContent);

    // * profile 1 checks for notification for tagged post
    cy.signOut(HasBackedUp.Yes);

    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    verifyNotificationCounter(1);
    goToProfilePageFromHeader();
    verifyNotificationCounter(0);
    checkLatestNotification([profile2.username, 'tagged your post', postTag], LatestNotificationReadState.Unread);

    // * toggle tabs to check unread dot disappears
    causeNotificationsToBeRead();
    verifyNotificationCounter(0);
    checkLatestNotification([profile2.username, 'tagged your post', postTag], LatestNotificationReadState.Read);

    // TODO: add checks for disabled notifications
    // * profile 1 disables notifications for tagged profile
    // * profile 2 disables notifications for tagged post
    // * profile 2 creates a post
    // * profile 2 tags profile 1's profile
    // * profile 1 checks for absence of notifications
    // * profile 1 tags profile 2's post
    // * profile 2 checks for absence of notifications
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
    // todo: change text when placeholder UI is updated, see https://github.com/pubky/pubky-app/issues/1789
    cy.get('[data-cy="profile-tab-content"]').should('contain.text', 'Nothing to see here yet');
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

    // TODO: add checks for disabled notifications
    // * profile 1 disables notifications for being replied to
    // * profile 1 creates a post (2)
    // * profile 2 replies to profile 1's post (2)
    // * profile 1 checks for absence of notifications
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

    // TODO: add checks for disabled notifications
    // * profile 1 disables notifications for being reposted
    // * profile 1 creates a post (2)
    // * profile 2 reposts profile 1's post (2)
    // * profile 1 checks for absence of notifications
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

    // TODO: add checks for disabled notifications
    // * profile 2 disables notifications for being replied to
    // * profile 1 creates a post that will be replied to and then deleted
    // * profile 2 replies to profile 1's post
    // * profile 1 deletes own post
    // * profile 2 checks for absence of notifications
  });

  it('can be notified for a post being deleted that you reposted', () => {
    // * profile 1 creates a post (1) that will be reposted and then deleted
    const postContent = `The one who reposts this post will be notified when it is deleted! ${Date.now()}`;
    createQuickPost(postContent);

    // * profile 2 reposts profile 1's post
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    cy.findFirstPostInFeed().innerTextContains(postContent);
    repostPost({ repostContent: 'I reposted your post!', filterText: postContent });

    // * profile 1 deletes own post (1)
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    // Go to profile page and click Posts tab to see own posts (home feed shows followed users' posts)
    goToProfilePageFromHeader();
    cy.get('[data-cy="profile-filter-item-posts"]').click();
    cy.get('[data-cy="profile-filter-item-posts"]').closest('[data-selected="true"]').should('exist');
    deletePost({ postIdx: 0, filterText: postContent });

    // * profile 2 checks for notification for post being deleted
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

    // TODO: add checks for disabled notifications
    // * profile 2 disables notifications for post being deleted that you reposted
    // * profile 1 creates a post (2) that will be reposted and then deleted
    // * profile 2 reposts profile 1's post (2)
    // * profile 1 deletes own post (2)
    // * profile 2 checks for absence of notifications
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

  it('can be notified for a post being edited that you reposted', () => {
    // * profile 1 creates a post (1) that will be reposted and then edited
    const postContent = `The one who reposts this post will be notified when it is edited! ${Date.now()}`;
    const editedContent = `This post has been edited! ${Date.now()}`;
    createQuickPost(postContent);

    // * profile 2 reposts profile 1's post
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    cy.findFirstPostInFeed().innerTextContains(postContent);
    repostPost({ repostContent: 'I reposted your post!', filterText: postContent });

    // * profile 1 edits own post (1)
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    goToProfilePageFromHeader();
    cy.get('[data-cy="profile-filter-item-posts"]').click();
    cy.get('[data-cy="profile-filter-item-posts"]').closest('[data-selected="true"]').should('exist');
    editPost({ newPostContent: editedContent, postIdx: 0, filterText: postContent });

    // * profile 2 checks for notification for post being edited
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

  it('can display counter for multiple new notifications');
});
