import { backupDownloadFilePath } from '../support/common';
import { slowCypressDown } from 'cypress-slow-down';
// registers the cy.slowDown and cy.slowDownEnd commands
import 'cypress-slow-down/commands';
import {
  cannotFindPostInFeed,
  checkPostIsAtIndexInFeed,
  countPostsInFeed,
  createQuickPost,
  fastTagPostInFeed,
  repostPost,
  waitForFeedToLoad,
} from '../support/posts';
import { searchAndFollowProfile } from '../support/contacts';
import { BackupType, HasBackedUp } from '../support/types/enums';

// Profile 1 follows Profile 2 and is friends with Profile 2. Profile 1 also follows Profile 3 and Profile 4.
const profile1 = {
  username: 'Profile #1',
  bio: 'Follows Profile #2',
  pubkyAlias: 'pubky_1',
  postText1: `Profile 1's post ${Date.now()}`,
  postText2: `Profile 1's post to be reposted ${Date.now()}`,
};
// Profile 2 follows Profile 1 and is friends with Profile 1.
const profile2 = {
  username: 'Profile #2',
  bio: 'Follows Profile #1',
  pubkyAlias: 'pubky_2',
  postText: `Profile 2's post ${Date.now()}`,
  repostText: "Repost of Profile 1's post",
};
// Profile 3 follows profile 2 but is not followed back
const profile3 = {
  username: 'Profile #3',
  bio: 'Follows Profile #2',
  pubkyAlias: 'pubky_3',
  postText: `Profile 3's post ${Date.now()}`,
};
// Profile 4 follows no-one and is followed by no-one
const profile4 = {
  username: 'Profile #4',
  bio: 'Follows no-one',
  pubkyAlias: 'pubky_4',
  postText: `Profile 4's post ${Date.now()}`,
};

describe('feed and filters', () => {
  before(() => {
    slowCypressDown();
    cy.deleteDownloadsFolder();

    // * create profile 1 of 4 and post
    cy.onboardAsNewUser(profile1.username, profile1.bio, [BackupType.EncryptedFile], profile1.pubkyAlias);
    createQuickPost(profile1.postText1);
    createQuickPost(profile1.postText2);
    cy.signOut(HasBackedUp.Yes);

    // * create profile 2 of 4, post and repost profile 1's post
    cy.onboardAsNewUser(profile2.username, profile2.bio, [BackupType.EncryptedFile], profile2.pubkyAlias);
    createQuickPost(profile2.postText);
    // find Profile 1's latest post and repost it
    repostPost({ repostContent: profile2.repostText, filterText: profile1.postText2 });
    // follow Profile 1
    cy.get(`@${profile1.pubkyAlias}`).then((pubky) => {
      searchAndFollowProfile(`${pubky}`, profile1.username);
    });
    cy.signOut(HasBackedUp.Yes);

    // * create profile 3 of 4, post and follow profile 2
    cy.onboardAsNewUser(profile3.username, profile3.bio, [BackupType.EncryptedFile], profile3.pubkyAlias);
    createQuickPost(profile3.postText);
    // follow profile 2
    cy.get(`@${profile2.pubkyAlias}`).then((pubky) => {
      searchAndFollowProfile(`${pubky}`, profile2.username);
    });
    cy.signOut(HasBackedUp.Yes);

    // * create profile 4 of 4 and post
    cy.onboardAsNewUser(profile4.username, profile4.bio, [BackupType.EncryptedFile], profile4.pubkyAlias);
    createQuickPost(profile4.postText);
    // tag profile 3's post 5 times for max popularity
    fastTagPostInFeed(['p3tag1', 'p3tag2', 'p3tag3', 'p3tag4', 'p3tag5'], profile3.postText);
    // tag profile 2's post 4 times to make it the second most popular
    fastTagPostInFeed(['p2tag1', 'p2tag2', 'p2tag3', 'p2tag4'], profile2.postText);
    cy.signOut(HasBackedUp.Yes);

    // * sign back in as profile 1 and follow profile 2, 3 and 4.
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    [profile2, profile3, profile4].forEach((profile) => {
      cy.get(`@${profile.pubkyAlias}`).then((pubky) => {
        searchAndFollowProfile(`${pubky}`, profile.username);
      });
    });
    cy.signOut(HasBackedUp.Yes);
  });

  it('can filter to view all posts in the recent sorting order (default view)', () => {
    // * sign in as profile 2 and view Reach All posts, all can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    // Reach All is the default view so no need to click
    // Recent is the default sort so no need to click

    // check all posts are visible
    cy.findFirstPostInFeedFiltered(profile1.postText1).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText2).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile2.postText).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile2.repostText).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile3.postText).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile4.postText).should('be.visible');

    // check posts are in the correct order
    checkPostIsAtIndexInFeed(profile4.postText, 0);
    checkPostIsAtIndexInFeed(profile3.postText, 1);
    checkPostIsAtIndexInFeed(profile2.repostText, 2);
    checkPostIsAtIndexInFeed(profile2.postText, 3);
    checkPostIsAtIndexInFeed(profile1.postText2, 4);
    checkPostIsAtIndexInFeed(profile1.postText1, 5);

    cy.signOut(HasBackedUp.Yes);

    // * sign in as profile 4 and view Reach All posts, all can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile4.username));
    // Reach All is the default view so no need to click

    // check all posts are visible
    cy.findFirstPostInFeedFiltered(profile1.postText1).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText2).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile2.postText).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile2.repostText).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile3.postText).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile4.postText).should('be.visible');

    // * check some Hot tags are visible
    cy.get('[data-cy="hot-tags"]')
      .should('be.visible')
      .within(() => {
        cy.get('[data-cy="hot-tags-list"]').children().should('have.length.above', 0);
      });
  });

  it('can filter to view only posts and reposts of following', () => {
    // * sign in as profile 2 and view Reach Following, only profile 1's posts can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    // click the Following filter
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[aria-label="Following"]').click();
    waitForFeedToLoad();

    cy.findFirstPostInFeedFiltered(profile1.postText1).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText2).should('be.visible');
    // can see own posts
    cy.findFirstPostInFeedFiltered(profile2.postText).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile2.repostText).should('be.visible');
    cannotFindPostInFeed(profile3.postText);
    cannotFindPostInFeed(profile4.postText);

    cy.signOut(HasBackedUp.Yes);

    // * sign in as profile 3 and view Reach Following, only profile 2's post can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile3.username));
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[aria-label="Following"]').click();
    waitForFeedToLoad();

    cy.findFirstPostInFeedFiltered(profile2.postText).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile2.repostText).should('be.visible');
    // 1 occurrence of profile 2 reposting profile 1's post
    countPostsInFeed(profile1.postText2, 1);
    // can see own post
    cy.findFirstPostInFeedFiltered(profile3.postText).should('be.visible');
    cannotFindPostInFeed(profile1.postText1);
    cannotFindPostInFeed(profile4.postText);

    cy.signOut(HasBackedUp.Yes);

    // * sign in as profile 4 and view Reach Following, no posts can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile4.username));
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[aria-label="Following"]').click();
    waitForFeedToLoad();

    cannotFindPostInFeed(profile1.postText1);
    cannotFindPostInFeed(profile1.postText2);
    cannotFindPostInFeed(profile2.postText);
    cannotFindPostInFeed(profile2.repostText);
    cannotFindPostInFeed(profile3.postText);
    // cannot see own post when no one else's posts are seen in following filter
    cannotFindPostInFeed(profile4.postText);
    cy.get('[data-cy="timeline-container"]').should('contain.text', 'No posts found');
  });

  it('can filter to view only posts and reposts of friends', () => {
    // * sign in as profile 1 and view Reach Friends, only profile 2's post can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    waitForFeedToLoad();
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[aria-label="Friends"]').click();
    waitForFeedToLoad();

    cy.findFirstPostInFeedFiltered(profile2.postText).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile2.repostText).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText1).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText2).should('be.visible');
    // 2 occurrences of profile 1's post due to profile 2 reposting it
    countPostsInFeed(profile1.postText2, 2);
    // can see own post
    cy.findFirstPostInFeedFiltered(profile1.postText1).should('be.visible');
    cannotFindPostInFeed(profile3.postText);
    cannotFindPostInFeed(profile4.postText);

    cy.signOut(HasBackedUp.Yes);

    // * sign in as profile 2 and view Reach Friends, only profile 1's posts can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    waitForFeedToLoad();
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[aria-label="Friends"]').click();
    waitForFeedToLoad();
    cy.findFirstPostInFeedFiltered(profile1.postText1).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText2).should('be.visible');
    // can see own posts
    cy.findFirstPostInFeedFiltered(profile2.postText).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile2.repostText).should('be.visible');
    cannotFindPostInFeed(profile3.postText);
    cannotFindPostInFeed(profile4.postText);

    cy.signOut(HasBackedUp.Yes);

    // * sign in as profile 3 and view Reach Friends, no posts can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile3.username));
    waitForFeedToLoad();
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[aria-label="Friends"]').click();
    waitForFeedToLoad();

    cannotFindPostInFeed(profile1.postText1);
    cannotFindPostInFeed(profile1.postText2);
    cannotFindPostInFeed(profile2.postText);
    cannotFindPostInFeed(profile2.repostText);
    // cannot see own post when no one else's posts are seen in friends filter
    cannotFindPostInFeed(profile3.postText);
    cannotFindPostInFeed(profile4.postText);
  });

  it('can sort by popularity', () => {
    // * sign in as profile 1 and sort by Popularity with Reach Following posts
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[aria-label="Following"]').click();
    waitForFeedToLoad();
    cy.get('[data-cy="filter-sort-radiogroup"]').find('[aria-label="Popularity"]').click();
    waitForFeedToLoad();

    // * check the posts are in the correct order
    // profile 3's post is the most popular because it has 5 tags
    checkPostIsAtIndexInFeed(profile3.postText, 0);
    // profile 2's post is the second most popular because it has 4 tags
    checkPostIsAtIndexInFeed(profile2.postText, 1);
    // profile 1's second post would be the third most popular because it has 1 repost but
    // own posts are not seen when filtering by following
    // the remaining posts are of equal popularity so they are sorted by recency
    checkPostIsAtIndexInFeed(profile4.postText, 2);
    checkPostIsAtIndexInFeed(profile2.repostText, 3);
  });

  // TODO: implement when custom feeds are supported in the app
  it.skip('can create and delete a custom feed', () => {});

  it.skip('can create a custom feed with filters', () => {});
});
