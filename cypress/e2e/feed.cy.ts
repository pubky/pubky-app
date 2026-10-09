import { backupDownloadFilePath } from '../support/common';
import {
  addCustomFeedTag,
  chooseCustomFeedOption,
  expectFeedTab,
  expectTimelineContains,
  expectTimelineEmpty,
  expectTimelineOmits,
  expectVisibleContentSelected,
  expectVisibleReachSelected,
  expectVisibleSortSelected,
  goToHomeFeedTab,
  openCreateFeedDialog,
  openEditFeedDialog,
  removeCustomFeedTag,
  resetHomeFeedToAllRecent,
  saveCustomFeed,
  waitForPostOrder,
} from '../support/feeds';
import { slowCypressDown } from 'cypress-slow-down';
// registers the cy.slowDown and cy.slowDownEnd commands
import 'cypress-slow-down/commands';
import {
  cannotFindPostInFeed,
  checkPostIsAtIndexInFeed,
  countPostsInFeed,
  createQuickArticle,
  createQuickPost,
  createQuickPostWithImage,
  fastTagPostInFeed,
  repostPost,
  waitForFeedToLoad,
} from '../support/posts';
import { followFromPostMenu, searchAndFollowProfile, searchForProfileByPubky } from '../support/contacts';
import { addProfileTags } from '../support/profile';
import { BackupType, CheckForNewPosts, HasBackedUp, PostType, WaitForNewPosts } from '../support/types/enums';
import { defaultMs, fastMs, slowMs } from '../support/slow-down';

// Temporary extra delay around filtered-feed sign-in/clicks (https://github.com/pubky/pubky-app/issues/2142).
// Must be applied with cy.slowDown / cy.slowDownEnd: slowCypressDown() is synchronous and
// cannot change delay mid-test, and a bare slowCypressDown() reuses the last delay instead of defaultMs.
const filteredFeedWorkaroundMs = () => (Cypress.expose('ci') ? fastMs * 2 : slowMs);

// Profile 1 follows Profile 2 and is friends with Profile 2. Profile 1 also follows Profile 3 and Profile 4.
// Needs 5 posts to be suggested in "who to follow"
const profile1 = {
  username: 'Profile #1',
  bio: 'Follows Profile #2',
  pubkyAlias: 'pubky_1',
  postText1: `Profile 1's post ${Date.now()}`,
  postText2: `Profile 1's post to be reposted ${Date.now()}`,
  postText3: `Profile 1's third post ${Date.now()}`,
  postText4: `Profile 1's fourth post ${Date.now()}`,
  postText5: `Profile 1's fifth post ${Date.now()}`,
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

// Profile 1 is 2 hops from Profile 3 (Profile 3 -> Profile 2 -> Profile 1), so tagging Profile 4's
// profile with this label proves 'Tagged as' considers taggers within the viewer's web of trust.
const taggedAsLabelInNetwork = 'taggedbyp1';
// Profile 4 is 3 hops from Profile 3 (outside their web of trust), so tagging Profile 1's profile
// with this label proves 'Tagged as' does not consider taggers outside the viewer's web of trust.
const taggedAsLabelOutsideNetwork = 'taggedbyp4';

describe('feed and filters', () => {
  before(() => {
    slowCypressDown();
    cy.deleteDownloadsFolder();

    // * create profile 1 of 4 and post
    cy.onboardAsNewUser(profile1.username, profile1.bio, [BackupType.EncryptedFile], profile1.pubkyAlias);
    createQuickPost(profile1.postText1);
    createQuickPost(profile1.postText2);
    createQuickPost(profile1.postText3);
    createQuickPost(profile1.postText4);
    createQuickPost(profile1.postText5);
    cy.signOut(HasBackedUp.Yes);

    // * create profile 2 of 4, post and repost profile 1's post
    cy.onboardAsNewUser(profile2.username, profile2.bio, [BackupType.EncryptedFile], profile2.pubkyAlias);
    createQuickPost(profile2.postText);
    // find Profile 1's latest post and repost it
    repostPost({ repostContent: profile2.repostText, filterText: profile1.postText2 });
    // follow Profile 1 from the original post card rather than the repost card
    followFromPostMenu(profile1.postText2, PostType.Post);
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
    // profile 4 is outside profile 3's 2-hop network, so tagging profile 1's profile here
    // proves 'Tagged as' does not consider taggers outside the viewer's web of trust
    cy.get(`@${profile1.pubkyAlias}`).then((pubky) => {
      searchForProfileByPubky(`${pubky}`, profile1.username);
    });
    cy.get('[data-cy="profile-tag-btn"]').click();
    addProfileTags([taggedAsLabelOutsideNetwork]);
    cy.signOut(HasBackedUp.Yes);

    // * sign back in as profile 1 and follow profile 2, 3 and 4.
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    [profile2, profile3, profile4].forEach((profile) => {
      cy.get(`@${profile.pubkyAlias}`).then((pubky) => {
        searchAndFollowProfile(`${pubky}`, profile.username);
      });
    });
    // profile 1 is 2 hops from profile 3, so tagging profile 4's profile here (already on
    // their page after the follow loop above) proves 'Tagged as' considers taggers within
    // the viewer's web of trust
    cy.get('[data-cy="profile-tag-btn"]').click();
    addProfileTags([taggedAsLabelInNetwork]);
    cy.signOut(HasBackedUp.Yes);
  });

  beforeEach(() => {
    // in case it gets changed by a test and not reset
    cy.slowDown(defaultMs);
  });

  it('can filter to view all posts in the recent sorting order (default view)', () => {
    // * sign in as profile 2 and view Reach All posts, all can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    // Reach All is the default view so no need to click
    // Recent is the default sort so no need to click

    // check all posts are visible
    cy.findFirstPostInFeedFiltered(profile1.postText1).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText2).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText3).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText4).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText5).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile2.postText).should('be.visible');
    cy.findFirstPostInFeedFilteredByType(profile2.repostText, PostType.Repost).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile3.postText).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile4.postText).should('be.visible');

    // check posts are in the correct order
    checkPostIsAtIndexInFeed(profile4.postText, 0);
    checkPostIsAtIndexInFeed(profile3.postText, 1);
    checkPostIsAtIndexInFeed(profile2.repostText, 2, profile1.postText2);
    checkPostIsAtIndexInFeed(profile2.postText, 3);
    checkPostIsAtIndexInFeed(profile1.postText5, 4);
    checkPostIsAtIndexInFeed(profile1.postText4, 5);
    checkPostIsAtIndexInFeed(profile1.postText3, 6);
    checkPostIsAtIndexInFeed(profile1.postText2, 7);
    checkPostIsAtIndexInFeed(profile1.postText1, 8);

    cy.signOut(HasBackedUp.Yes);

    // * sign in as profile 4 and view Reach All posts, all can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile4.username));
    // Reach All is the default view so no need to click

    // check all posts are visible
    cy.findFirstPostInFeedFiltered(profile1.postText1).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText2).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText3).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText4).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText5).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile2.postText).should('be.visible');
    cy.findFirstPostInFeedFilteredByType(profile2.repostText, PostType.Repost).should('be.visible');
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
    // todo: remove workaround once bug is fixed, https://github.com/pubky/pubky-app/issues/2142
    // slow down execution locally to avoid seeing wrong profile in filtered feed
    cy.slowDown(filteredFeedWorkaroundMs());

    // * sign in as profile 2 and view Reach Following, only profile 1's posts can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    // click the Following filter
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[data-cy="following-reach-toggle"]').click();
    waitForFeedToLoad();

    // todo: remove reset slow down once bug is fixed, https://github.com/pubky/pubky-app/issues/2142
    cy.slowDownEnd();

    cy.findFirstPostInFeedFiltered(profile1.postText1).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText2).should('be.visible');
    // cannot see own posts
    cannotFindPostInFeed(profile2.postText);
    cannotFindPostInFeed(profile2.repostText);
    // cannot see other people's posts
    cannotFindPostInFeed(profile3.postText);
    cannotFindPostInFeed(profile4.postText);

    cy.signOut(HasBackedUp.Yes);

    // todo: remove slow down once bug is fixed, https://github.com/pubky/pubky-app/issues/2142
    cy.slowDown(filteredFeedWorkaroundMs());

    // * sign in as profile 3 and view Reach Following, only profile 2's post can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile3.username));
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[data-cy="following-reach-toggle"]').click();
    waitForFeedToLoad();

    // todo: remove reset slow down once bug is fixed, https://github.com/pubky/pubky-app/issues/2142
    cy.slowDownEnd();

    cy.findFirstPostInFeedFiltered(profile2.postText).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile2.repostText).should('be.visible');
    // 1 occurrence of profile 2 reposting profile 1's post
    countPostsInFeed(profile1.postText2, 1);
    // cannot see own post
    cannotFindPostInFeed(profile3.postText);
    cannotFindPostInFeed(profile1.postText1);
    cannotFindPostInFeed(profile4.postText);

    cy.signOut(HasBackedUp.Yes);

    // todo: remove slow down once bug is fixed, https://github.com/pubky/pubky-app/issues/2142
    cy.slowDown(filteredFeedWorkaroundMs());

    // * sign in as profile 4 and view Reach Following, no posts can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile4.username));
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[data-cy="following-reach-toggle"]').click();
    waitForFeedToLoad();

    // todo: remove reset slow down once bug is fixed, https://github.com/pubky/pubky-app/issues/2142
    cy.slowDownEnd();

    cannotFindPostInFeed(profile1.postText1);
    cannotFindPostInFeed(profile1.postText2);
    cannotFindPostInFeed(profile2.postText);
    cannotFindPostInFeed(profile2.repostText);
    cannotFindPostInFeed(profile3.postText);
    // cannot see own post
    cannotFindPostInFeed(profile4.postText);
    cy.get('[data-cy="timeline-container"]').should('contain.text', 'No posts found');
  });

  it('can filter to view only posts and reposts of friends', () => {
    // todo: remove workaround once bug is fixed, https://github.com/pubky/pubky-app/issues/2142
    // slow down execution more locally to avoid seeing wrong profile in filtered feed
    cy.slowDown(filteredFeedWorkaroundMs());

    // * sign in as profile 1 and view Reach Friends, only profile 2's post can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[data-cy="friends-reach-toggle"]').click();
    waitForFeedToLoad();

    // todo: remove reset slow down once bug is fixed, https://github.com/pubky/pubky-app/issues/2142
    cy.slowDownEnd();

    cy.findFirstPostInFeedFiltered(profile2.postText).should('be.visible');
    cy.findFirstPostInFeedFilteredByType(profile2.repostText, PostType.Repost).should('be.visible');
    // 1 occurrence of own post due to profile 2 reposting it
    countPostsInFeed(profile1.postText2, 1);
    // cannot see own posts (that were not reposted by profile 2)
    cannotFindPostInFeed(profile1.postText1);
    cannotFindPostInFeed(profile1.postText3);
    cannotFindPostInFeed(profile3.postText);
    cannotFindPostInFeed(profile4.postText);

    cy.signOut(HasBackedUp.Yes);

    // todo: remove slow down once bug is fixed, https://github.com/pubky/pubky-app/issues/2142
    cy.slowDown(filteredFeedWorkaroundMs());

    // * sign in as profile 2 and view Reach Friends, only profile 1's posts can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[data-cy="friends-reach-toggle"]').click();
    waitForFeedToLoad();

    // todo: remove reset slow down once bug is fixed, https://github.com/pubky/pubky-app/issues/2142
    cy.slowDownEnd();

    cy.findFirstPostInFeedFiltered(profile1.postText1).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText2).should('be.visible');
    // cannot see own posts
    cannotFindPostInFeed(profile2.postText);
    cannotFindPostInFeed(profile2.repostText);
    // cannot see other people's posts
    cannotFindPostInFeed(profile3.postText);
    cannotFindPostInFeed(profile4.postText);

    cy.signOut(HasBackedUp.Yes);

    // todo: remove slow down once bug is fixed, https://github.com/pubky/pubky-app/issues/2142
    cy.slowDown(filteredFeedWorkaroundMs());

    // * sign in as profile 3 and view Reach Friends, no posts can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile3.username));
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[data-cy="friends-reach-toggle"]').click();
    waitForFeedToLoad();

    // todo: remove reset slow down once bug is fixed, https://github.com/pubky/pubky-app/issues/2142
    cy.slowDownEnd();

    cannotFindPostInFeed(profile1.postText1);
    cannotFindPostInFeed(profile1.postText2);
    cannotFindPostInFeed(profile2.postText);
    cannotFindPostInFeed(profile2.repostText);
    // cannot see own post when no one else's posts are seen in friends filter
    cannotFindPostInFeed(profile3.postText);
    cannotFindPostInFeed(profile4.postText);
  });

  it('can filter to view only own posts', () => {
    // * sign in as profile 2 and view Reach Me, only own post and repost can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[data-cy="me-reach-toggle"]').click();
    waitForFeedToLoad();

    cy.findFirstPostInFeedFiltered(profile2.postText).should('be.visible');
    cy.findFirstPostInFeedFilteredByType(profile2.repostText, PostType.Repost).should('be.visible');
    // profile 1's second post only appears embedded as the quoted post inside profile 2's own repost
    countPostsInFeed(profile1.postText2, 1);
    cannotFindPostInFeed(profile1.postText1);
    cannotFindPostInFeed(profile1.postText3);
    cannotFindPostInFeed(profile1.postText4);
    cannotFindPostInFeed(profile1.postText5);
    cannotFindPostInFeed(profile3.postText);
    cannotFindPostInFeed(profile4.postText);
  });

  it('can filter to view posts from your web of trust', () => {
    // todo: remove workaround once bug is fixed, https://github.com/pubky/pubky-app/issues/2142
    // slow down execution locally to avoid seeing wrong profile in filtered feed
    cy.slowDown(filteredFeedWorkaroundMs());

    // * sign in as profile 3 and view Reach My network
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile3.username));
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[data-cy="network-reach-toggle"]').click();
    waitForFeedToLoad();

    // todo: remove reset slow down once bug is fixed, https://github.com/pubky/pubky-app/issues/2142
    cy.slowDownEnd();

    // profile 1 is 2 hops away (profile 3 -> profile 2 -> profile 1) so their posts are included
    cy.findFirstPostInFeedFiltered(profile1.postText1).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText2).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText3).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText4).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText5).should('be.visible');
    // profile 2 is followed directly (1 hop)
    cy.findFirstPostInFeedFiltered(profile2.postText).should('be.visible');
    cy.findFirstPostInFeedFilteredByType(profile2.repostText, PostType.Repost).should('be.visible');
    // my network does not include the viewer's own posts
    cannotFindPostInFeed(profile3.postText);
    // profile 4 is 3 hops away (profile 3 -> profile 2 -> profile 1 -> profile 4), outside the network
    cannotFindPostInFeed(profile4.postText);
  });

  it('can filter to view posts by users tagged as chosen profile tags', () => {
    // todo: remove workaround once bug is fixed, https://github.com/pubky/pubky-app/issues/2142
    // slow down execution locally to avoid seeing wrong profile in filtered feed
    cy.slowDown(filteredFeedWorkaroundMs());

    // * sign in as profile 3 and view Reach Tagged as
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile3.username));
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[data-cy="tagged-as-reach-toggle"]').click();

    // * select the tag applied by profile 4, who is outside profile 3's 2-hop network - not honored
    cy.get('[data-cy="add-tag-input"]').type(`${taggedAsLabelOutsideNetwork}{enter}`);
    waitForFeedToLoad();
    cy.get('[data-cy="timeline-container"]').should('contain.text', 'No posts found');

    // * swap to the tag applied by profile 1, who is within profile 3's 2-hop network - honored,
    // even though the tagged profile (profile 4) is otherwise outside profile 3's reach
    cy.get(`[data-cy="post-tag"][data-tag-label="${taggedAsLabelOutsideNetwork}"]`)
      .find('[data-cy="post-tag-remove-btn"]')
      .click();
    cy.get('[data-cy="add-tag-input"]').type(`${taggedAsLabelInNetwork}{enter}`);
    waitForFeedToLoad();

    // todo: remove reset slow down once bug is fixed, https://github.com/pubky/pubky-app/issues/2142
    cy.slowDownEnd();

    cy.findFirstPostInFeedFiltered(profile4.postText).should('be.visible');
    cannotFindPostInFeed(profile1.postText1);
    cannotFindPostInFeed(profile2.postText);
    cannotFindPostInFeed(profile3.postText);
  });

  it('"who to follow" does not suggest users you are already following', () => {
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));

    cy.get('[data-cy="who-to-follow"]').within(() => {
      cy.contains(profile1.username).should('not.exist');
      cy.contains(profile2.username).should('not.exist');
      cy.contains(profile3.username).should('not.exist');
      cy.contains(profile4.username).should('not.exist');
    });
  });

  it('who to follow sidebar and who-to-follow page suggested other profiles', () => {
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile3.username));

    cy.get('[data-cy="who-to-follow"]').within(() => {
      cy.contains(profile1.username).should('be.visible');
      cy.contains(profile2.username).should('not.exist');
      cy.contains(profile3.username).should('not.exist');
      cy.contains(profile4.username).should('not.exist');
    });

    cy.get('[data-cy="who-to-follow-see-all"]').click();
    cy.location('pathname').should('eq', '/who-to-follow');

    cy.get('[data-cy="who-to-follow-page"]').within(() => {
      cy.contains(profile1.username).should('be.visible');
      cy.contains(profile2.username).should('not.exist');
      cy.contains(profile3.username).should('not.exist');
      cy.contains(profile4.username).should('not.exist');
    });

    cy.signOut(HasBackedUp.Yes);
  });

  it('can sort by popularity', () => {
    // * sign in as profile 1 and sort by Popularity with Reach Following posts
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[data-cy="following-reach-toggle"]').click();
    waitForFeedToLoad();
    cy.get('[data-cy="filter-sort-radiogroup"]').find('[data-cy="popularity-sort-toggle"]').click();
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
    checkPostIsAtIndexInFeed(profile2.repostText, 3, profile1.postText2);
  });

  it('can create and delete a custom feed', () => {
    const stamp = Date.now();
    const feedName = `Night feed ${stamp}`;
    const renamed = `Dawn feed ${stamp}`;
    const tag = `night${String(stamp).slice(-6)}`;
    const postContent = `Custom feed post ${stamp}`;

    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    resetHomeFeedToAllRecent();
    createQuickPost(postContent, [tag]);
    cy.findFirstPostInFeedFiltered(postContent, CheckForNewPosts.No, WaitForNewPosts.Yes);

    openCreateFeedDialog();
    cy.get('[data-testid="feed-name-input"]').type(feedName);
    addCustomFeedTag(tag);
    saveCustomFeed();

    expectFeedTab(feedName);
    cy.location('pathname').should('match', /^\/feed\/.+/);
    expectTimelineContains(postContent);
    expectTimelineOmits(profile2.postText);

    cy.location('pathname').as('feedPath');
    openEditFeedDialog(feedName);
    cy.get('[data-testid="feed-name-input"]').clear().type(renamed);
    cy.get('[data-testid="save-feed-button"]').should('not.be.disabled').click();
    cy.get('[data-testid="custom-feed-dialog-content"]').should('not.exist');
    // A rename does not change the feed id.
    cy.get('@feedPath').then((feedPath) => {
      cy.location('pathname').should('eq', feedPath);
    });
    expectFeedTab(renamed);
    cy.get('[data-cy="feed-navigation"]').find(`a[aria-label="${feedName}"]`).should('not.exist');

    cy.reload();
    waitForFeedToLoad();
    cy.get('@feedPath').then((feedPath) => {
      cy.location('pathname').should('eq', feedPath);
    });
    expectFeedTab(renamed);
    expectTimelineContains(postContent);

    openEditFeedDialog(renamed);
    cy.get('[data-testid="delete-feed-button"]').click();
    cy.location('pathname').should('eq', '/home');
    cy.get('[data-cy="feed-navigation"]').find(`a[aria-label="${renamed}"]`).should('not.exist');

    cy.reload();
    waitForFeedToLoad();
    cy.get('[data-cy="feed-navigation"]').find(`a[aria-label="${renamed}"]`).should('not.exist');
    cy.signOut(HasBackedUp.Yes);
  });

  it('can create a custom feed with filters', () => {
    const stamp = Date.now();
    const reachTag = `p4${String(stamp).slice(-6)}`;
    const sortTag = `sort${String(stamp).slice(-6)}`;
    const kindTag = `kind${String(stamp).slice(-6)}`;
    const older = `Older sort post ${stamp}`;
    const newer = `Newer sort post ${stamp}`;
    const shortPost = `Kind short post ${stamp}`;
    const articleTitle = `Kind article ${stamp}`;
    const articleBody = `Kind article body ${stamp}`;
    const imagePost = `Kind image post ${stamp}`;
    const reachFeed = `Reach ${stamp}`;
    const sortFeed = `Sort ${stamp}`;
    const kindFeed = `Kind ${stamp}`;

    // Profile 3 follows only profile 2, and is friends with nobody.
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile3.username));
    resetHomeFeedToAllRecent();
    fastTagPostInFeed([reachTag], profile4.postText);

    createQuickPost(older, [sortTag]);
    cy.findFirstPostInFeedFiltered(older, CheckForNewPosts.No, WaitForNewPosts.Yes);
    createQuickPost(newer, [sortTag]);
    cy.findFirstPostInFeedFiltered(newer, CheckForNewPosts.No, WaitForNewPosts.Yes);
    fastTagPostInFeed(['sorta', 'sortb', 'sortc'], older);
    cy.findFirstPostInFeedFiltered(older).within(() => {
      cy.contains('button', 'sortc').should('be.visible');
    });

    createQuickPost(shortPost, [kindTag]);
    cy.findFirstPostInFeedFiltered(shortPost, CheckForNewPosts.No, WaitForNewPosts.Yes);
    createQuickArticle(articleTitle, articleBody);
    cy.findFirstPostInFeedFiltered(articleTitle, CheckForNewPosts.No, WaitForNewPosts.Yes);
    fastTagPostInFeed([kindTag], articleTitle);
    createQuickPostWithImage(imagePost);
    cy.findFirstPostInFeedFiltered(imagePost, CheckForNewPosts.No, WaitForNewPosts.Yes);
    fastTagPostInFeed([kindTag], imagePost);

    // Reach: All includes profile 4, Following does not, Following does include profile 2.
    openCreateFeedDialog();
    cy.get('[data-testid="feed-name-input"]').type(reachFeed);
    addCustomFeedTag(reachTag);
    chooseCustomFeedOption('reach-filter-section', 'All');
    saveCustomFeed();
    expectFeedTab(reachFeed);
    expectVisibleReachSelected('all-reach-toggle');
    expectTimelineContains(profile4.postText);
    expectTimelineOmits(profile2.postText);

    openEditFeedDialog(reachFeed);
    chooseCustomFeedOption('reach-filter-section', 'Following');
    saveCustomFeed();
    expectVisibleReachSelected('following-reach-toggle');
    expectTimelineEmpty();

    openEditFeedDialog(reachFeed);
    addCustomFeedTag('p2tag1');
    removeCustomFeedTag(reachTag);
    saveCustomFeed();
    expectVisibleReachSelected('following-reach-toggle');
    expectTimelineContains(profile2.postText);
    expectTimelineOmits(profile4.postText);
    expectTimelineOmits(profile3.postText);

    openEditFeedDialog(reachFeed);
    chooseCustomFeedOption('reach-filter-section', 'Friends');
    saveCustomFeed();
    expectVisibleReachSelected('friends-reach-toggle');
    expectTimelineEmpty();

    cy.reload();
    waitForFeedToLoad();
    expectVisibleReachSelected('friends-reach-toggle');
    expectTimelineEmpty();
    cy.get('[data-testid="custom-feed-post-tags"]').should('contain.text', 'p2tag1');

    // Sort: Recent is newest first. Popularity puts the more-tagged post first, and that survives reload.
    goToHomeFeedTab();
    openCreateFeedDialog();
    cy.get('[data-testid="feed-name-input"]').type(sortFeed);
    addCustomFeedTag(sortTag);
    chooseCustomFeedOption('reach-filter-section', 'Me');
    chooseCustomFeedOption('sort-filter-section', 'Recent');
    saveCustomFeed();
    expectVisibleReachSelected('me-reach-toggle');
    expectVisibleSortSelected('recent-sort-toggle');
    waitForPostOrder(newer, older);

    openEditFeedDialog(sortFeed);
    chooseCustomFeedOption('sort-filter-section', 'Popularity');
    saveCustomFeed();
    expectVisibleSortSelected('popularity-sort-toggle');
    waitForPostOrder(older, newer);
    cy.reload();
    waitForFeedToLoad();
    expectVisibleSortSelected('popularity-sort-toggle');
    waitForPostOrder(older, newer);

    // Content: Posts, Articles and Images each keep only that kind. The last edit persists.
    goToHomeFeedTab();
    openCreateFeedDialog();
    cy.get('[data-testid="feed-name-input"]').type(kindFeed);
    addCustomFeedTag(kindTag);
    chooseCustomFeedOption('reach-filter-section', 'Me');
    chooseCustomFeedOption('content-filter-section', 'Posts');
    saveCustomFeed();
    expectVisibleContentSelected('Posts');
    expectTimelineContains(shortPost);
    expectTimelineOmits(articleTitle);
    expectTimelineOmits(imagePost);

    openEditFeedDialog(kindFeed);
    chooseCustomFeedOption('content-filter-section', 'Articles');
    saveCustomFeed();
    expectVisibleContentSelected('Articles');
    expectTimelineContains(articleTitle);
    expectTimelineOmits(shortPost);
    expectTimelineOmits(imagePost);

    openEditFeedDialog(kindFeed);
    chooseCustomFeedOption('content-filter-section', 'Images');
    saveCustomFeed();
    expectVisibleContentSelected('Images');
    expectTimelineContains(imagePost);
    expectTimelineOmits(shortPost);
    expectTimelineOmits(articleTitle);

    cy.reload();
    waitForFeedToLoad();
    expectVisibleContentSelected('Images');
    expectTimelineContains(imagePost);
    expectTimelineOmits(shortPost);

    openEditFeedDialog(kindFeed);
    cy.get('[data-testid="feed-name-input"]').should('have.value', kindFeed);
    cy.get('[data-testid="content-filter-section"]').should('contain.text', 'Images');
    cy.get('[data-testid="reach-filter-section"]').should('contain.text', 'Me');
    cy.get(`[data-cy="post-tag"][data-tag-label="${kindTag}"]`).should('be.visible');
    cy.get('[data-testid="dialog-close"]').filter(':visible').click();
    cy.get('[data-testid="custom-feed-dialog-content"]').should('not.exist');

    cy.signOut(HasBackedUp.Yes);
  });
});

describe('visual layout', () => {
  before(() => {
    slowCypressDown();
    cy.deleteDownloadsFolder();
  });

  it('can view image-only posts in visual layout', () => {
    const imagePostContent1 = `Image post 1 ${Date.now()}`;
    const imagePostContent2 = `Image post 2 ${Date.now()}`;
    const imagePostContent3 = `Image post 3 ${Date.now()}`;
    const textOnlyPostContent = `Text-only post ${Date.now()}`;

    cy.onboardAsNewUser('Pete the Photographer', 'I post photos');

    // create 2 posts with images
    [imagePostContent1, imagePostContent2].forEach((postContent) => {
      createQuickPostWithImage(postContent);
    });

    // create post with just text
    createQuickPost(textOnlyPostContent);

    // create another post with image (3 posts with images in total)
    createQuickPostWithImage(imagePostContent3);

    // switch to visual layout
    cy.get('[data-cy="filter-layout-radiogroup"]').find('[data-cy="visual-layout-toggle"]').click();

    // check the post with text is not visible
    cannotFindPostInFeed(textOnlyPostContent);
    cy.contains(textOnlyPostContent).should('not.exist');

    // check all visible posts contain an image
    cy.get('[data-cy="visual-feed-container"]').should('be.visible');
    cy.get('[data-cy="visual-feed-tile"]')
      .should('have.length.gte', 3)
      .each(($tile) => {
        cy.wrap($tile).find('img').should('exist').and('be.visible');
        // check overlay post content text is not visible whilst not hovering over the tile
        cy.wrap($tile).find('[data-testid="visual-overlay-content-stack"]').should('exist').and('not.be.visible');
      });
  });
});
