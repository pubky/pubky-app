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
  expectPostOrder,
  waitForPopularityOrder,
} from '../support/feeds';
import { slowCypressDown } from 'cypress-slow-down';
// registers the cy.slowDown and cy.slowDownEnd commands
import 'cypress-slow-down/commands';
import {
  cannotFindPostInFeed,
  checkPostIsAtIndexInFeed,
  countPostsInFeed,
  createQuickArticle,
  createQuickPostWithImage,
  fastTagPostInFeed,
  waitForFeedToLoad,
} from '../support/posts';
import { followIndexed, postIndexed, postTagsIndexed, userTagsIndexed, waitForNexus } from '../support/nexus';
import {
  createImagePostViaApi,
  createPostViaApi,
  followUserViaApi,
  repostViaApi,
  seedUserViaApi,
  tagPostViaApi,
  tagUserViaApi,
} from '../support/seed';
import { CheckForNewPosts, HasBackedUp, PostType, WaitForNewPosts } from '../support/types/enums';
import type { SeededPost, SeededUser } from '../support/types/seed';
import { defaultMs } from '../support/slow-down';

// Profile 1 follows Profile 2 and is friends with Profile 2. Profile 1 also follows Profile 3 and Profile 4.
// Needs 5 posts to be suggested in "who to follow"
const profile1 = {
  username: 'Profile #1',
  bio: 'Follows Profile #2',
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
  postText: `Profile 2's post ${Date.now()}`,
  repostText: "Repost of Profile 1's post",
};
// Profile 3 follows profile 2 but is not followed back
const profile3 = {
  username: 'Profile #3',
  bio: 'Follows Profile #2',
  postText: `Profile 3's post ${Date.now()}`,
};
// Profile 4 follows no-one and is followed by no-one
const profile4 = {
  username: 'Profile #4',
  bio: 'Follows no-one',
  postText: `Profile 4's post ${Date.now()}`,
};

// Profile 1 is 2 hops from Profile 3 (Profile 3 -> Profile 2 -> Profile 1), so tagging Profile 4's
// profile with this label proves 'Tagged as' considers taggers within the viewer's web of trust.
const taggedAsLabelInNetwork = 'taggedbyp1';
// Profile 4 is 3 hops from Profile 3 (outside their web of trust), so tagging Profile 1's profile
// with this label proves 'Tagged as' does not consider taggers outside the viewer's web of trust.
const taggedAsLabelOutsideNetwork = 'taggedbyp4';

describe('feed and filters', () => {
  let user1: SeededUser;
  let user2: SeededUser;
  let user3: SeededUser;
  let user4: SeededUser;
  // Every post the feed assertions read, oldest first
  const seededPosts: SeededPost[] = [];
  let profile1Post2: SeededPost;
  let profile2Post: SeededPost;
  let profile3Post: SeededPost;
  let profile4Post: SeededPost;

  // Seeded through the API: these profiles and their activity are only observed through the feed filters here.
  // Onboarding, posting, reposting, following and tagging in the UI are covered by their own specs.
  before(() => {
    slowCypressDown();
    cy.deleteDownloadsFolder();

    seedUserViaApi(profile1.username, { bio: profile1.bio, withRecoveryFile: true }).then((user) => {
      user1 = user;
    });
    seedUserViaApi(profile2.username, { bio: profile2.bio, withRecoveryFile: true }).then((user) => {
      user2 = user;
    });
    seedUserViaApi(profile3.username, { bio: profile3.bio, withRecoveryFile: true }).then((user) => {
      user3 = user;
    });
    seedUserViaApi(profile4.username, { bio: profile4.bio, withRecoveryFile: true }).then((user) => {
      user4 = user;
    });

    // Posts are created in the order the recency assertions expect, oldest first
    const seedPost = (seeded: Cypress.Chainable<SeededPost>) =>
      seeded.then((post) => {
        seededPosts.push(post);
        return post;
      });
    cy.then(() => {
      seedPost(createPostViaApi(user1, profile1.postText1));
      seedPost(createPostViaApi(user1, profile1.postText2)).then((post) => {
        profile1Post2 = post;
      });
      seedPost(createPostViaApi(user1, profile1.postText3));
      seedPost(createPostViaApi(user1, profile1.postText4));
      seedPost(createPostViaApi(user1, profile1.postText5));
      seedPost(createPostViaApi(user2, profile2.postText)).then((post) => {
        profile2Post = post;
      });
    });
    cy.then(() => {
      seedPost(repostViaApi(user2, profile1Post2, profile2.repostText));
      seedPost(createPostViaApi(user3, profile3.postText)).then((post) => {
        profile3Post = post;
      });
      seedPost(createPostViaApi(user4, profile4.postText)).then((post) => {
        profile4Post = post;
      });

      followUserViaApi(user2, user1);
      followUserViaApi(user3, user2);
      followUserViaApi(user1, user2);
      followUserViaApi(user1, user3);
      followUserViaApi(user1, user4);
    });

    cy.then(() => {
      // tag profile 3's post 5 times for max popularity
      tagPostViaApi(user4, profile3Post, ['p3tag1', 'p3tag2', 'p3tag3', 'p3tag4', 'p3tag5']);
      // tag profile 2's post 4 times to make it the second most popular
      tagPostViaApi(user4, profile2Post, ['p2tag1', 'p2tag2', 'p2tag3', 'p2tag4']);
      // profile 4 is outside profile 3's 2-hop network, so this tag on profile 1's profile
      // proves 'Tagged as' does not consider taggers outside the viewer's web of trust
      tagUserViaApi(user4, user1, [taggedAsLabelOutsideNetwork]);
      // profile 1 is 2 hops from profile 3, so this tag on profile 4's profile
      // proves 'Tagged as' considers taggers within the viewer's web of trust
      tagUserViaApi(user1, user4, [taggedAsLabelInNetwork]);
    });

    // Every post, follow and tag the reach, sort and 'Tagged as' assertions read
    cy.then(() =>
      waitForNexus(
        ...seededPosts.map(postIndexed),
        followIndexed(user2, user1),
        followIndexed(user3, user2),
        followIndexed(user1, user2),
        followIndexed(user1, user3),
        followIndexed(user1, user4),
        postTagsIndexed(profile3Post, ['p3tag1', 'p3tag2', 'p3tag3', 'p3tag4', 'p3tag5']),
        postTagsIndexed(profile2Post, ['p2tag1', 'p2tag2', 'p2tag3', 'p2tag4']),
        userTagsIndexed(user1, [taggedAsLabelOutsideNetwork]),
        userTagsIndexed(user4, [taggedAsLabelInNetwork]),
      ),
    );
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
    // * sign in as profile 2 and view Reach Following, only profile 1's posts can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    // click the Following filter
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[data-cy="following-reach-toggle"]').click();
    waitForFeedToLoad();

    cy.findFirstPostInFeedFiltered(profile1.postText1).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText2).should('be.visible');
    // cannot see own posts
    cannotFindPostInFeed(profile2.postText);
    cannotFindPostInFeed(profile2.repostText);
    // cannot see other people's posts
    cannotFindPostInFeed(profile3.postText);
    cannotFindPostInFeed(profile4.postText);

    cy.signOut(HasBackedUp.Yes);

    // * sign in as profile 3 and view Reach Following, only profile 2's post can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile3.username));
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[data-cy="following-reach-toggle"]').click();
    waitForFeedToLoad();

    cy.findFirstPostInFeedFiltered(profile2.postText).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile2.repostText).should('be.visible');
    // 1 occurrence of profile 2 reposting profile 1's post
    countPostsInFeed(profile1.postText2, 1);
    // cannot see own post
    cannotFindPostInFeed(profile3.postText);
    cannotFindPostInFeed(profile1.postText1);
    cannotFindPostInFeed(profile4.postText);

    cy.signOut(HasBackedUp.Yes);

    // * sign in as profile 4 and view Reach Following, no posts can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile4.username));
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[data-cy="following-reach-toggle"]').click();
    waitForFeedToLoad();

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
    // * sign in as profile 1 and view Reach Friends, only profile 2's post can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[data-cy="friends-reach-toggle"]').click();
    waitForFeedToLoad();

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

    // * sign in as profile 2 and view Reach Friends, only profile 1's posts can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile2.username));
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[data-cy="friends-reach-toggle"]').click();
    waitForFeedToLoad();

    cy.findFirstPostInFeedFiltered(profile1.postText1).should('be.visible');
    cy.findFirstPostInFeedFiltered(profile1.postText2).should('be.visible');
    // cannot see own posts
    cannotFindPostInFeed(profile2.postText);
    cannotFindPostInFeed(profile2.repostText);
    // cannot see other people's posts
    cannotFindPostInFeed(profile3.postText);
    cannotFindPostInFeed(profile4.postText);

    cy.signOut(HasBackedUp.Yes);

    // * sign in as profile 3 and view Reach Friends, no posts can be seen
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile3.username));
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[data-cy="friends-reach-toggle"]').click();
    waitForFeedToLoad();

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
    // * sign in as profile 3 and view Reach My network
    cy.signInWithEncryptedFile(backupDownloadFilePath(profile3.username));
    cy.get('[data-cy="filter-reach-radiogroup"]').find('[data-cy="network-reach-toggle"]').click();
    waitForFeedToLoad();

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

    createPostViaApi(user1, postContent, { tags: [tag] }).then((post) => waitForNexus(postTagsIndexed(post, [tag])));

    cy.signInWithEncryptedFile(backupDownloadFilePath(profile1.username));
    resetHomeFeedToAllRecent();
    cy.findFirstPostInFeedFiltered(postContent, CheckForNewPosts.No, WaitForNewPosts.Yes);

    openCreateFeedDialog();
    cy.get('[data-cy="custom-feed-name-input"]').type(feedName);
    addCustomFeedTag(tag);
    saveCustomFeed();

    expectFeedTab(feedName);
    cy.location('pathname').should('match', /^\/feed\/.+/);
    expectTimelineContains(postContent);
    expectTimelineOmits(profile2.postText);

    cy.location('pathname').as('feedPath');
    openEditFeedDialog(feedName);
    cy.get('[data-cy="custom-feed-name-input"]').clear().type(renamed);
    cy.get('[data-cy="custom-feed-save-btn"]').should('not.be.disabled').click();
    cy.get('[data-cy="custom-feed-dialog"]').should('not.exist');
    // A rename does not change the feed id.
    cy.get('@feedPath').then((feedPath) => {
      cy.location('pathname').should('eq', feedPath);
    });
    expectFeedTab(renamed);
    cy.get('[data-cy="feed-navigation"]')
      .find(`[data-cy="feed-navigation-custom-tab"][aria-label="${feedName}"]`)
      .should('not.exist');

    cy.reload();
    waitForFeedToLoad();
    cy.get('@feedPath').then((feedPath) => {
      cy.location('pathname').should('eq', feedPath);
    });
    expectFeedTab(renamed);
    expectTimelineContains(postContent);

    openEditFeedDialog(renamed);
    cy.intercept('DELETE', '**/pub/pubky.app/feeds/**').as('feedDelete');
    cy.get('[data-cy="custom-feed-delete-btn"]').click();
    cy.wait('@feedDelete').its('response.statusCode').should('be.within', 200, 299);
    cy.location('pathname').should('eq', '/home');
    cy.get('[data-cy="feed-navigation"]')
      .find(`[data-cy="feed-navigation-custom-tab"][aria-label="${renamed}"]`)
      .should('not.exist');

    cy.reload();
    waitForFeedToLoad();
    cy.get('[data-cy="feed-navigation"]')
      .find(`[data-cy="feed-navigation-custom-tab"][aria-label="${renamed}"]`)
      .should('not.exist');
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
    tagPostViaApi(user3, profile4Post, [reachTag]);
    createPostViaApi(user3, older, { tags: [sortTag] }).then((olderPost) => {
      createPostViaApi(user3, newer, { tags: [sortTag] }).then((newerPost) => {
        tagPostViaApi(user3, olderPost, ['sorta', 'sortb', 'sortc']);
        createPostViaApi(user3, shortPost, { tags: [kindTag] }).then((shortKindPost) =>
          waitForNexus(
            postTagsIndexed(profile4Post, [reachTag]),
            postTagsIndexed(olderPost, [sortTag, 'sorta', 'sortb', 'sortc']),
            postTagsIndexed(newerPost, [sortTag]),
            postTagsIndexed(shortKindPost, [kindTag]),
          ),
        );
      });
    });

    cy.signInWithEncryptedFile(backupDownloadFilePath(profile3.username));
    resetHomeFeedToAllRecent();
    cy.findFirstPostInFeedFiltered(older).within(() => {
      cy.get('[data-cy="post-tag"][data-tag-label="sortc"]').filter(':visible').should('have.length.at.least', 1);
    });

    // Keep these UI-created, not seeded: with the post kind filter test in posts.cy.ts skipped (#2900),
    // this is the only check that the composer files an article and an image post under their kind.
    createQuickArticle(articleTitle, articleBody);
    cy.findFirstPostInFeedFiltered(articleTitle, CheckForNewPosts.No, WaitForNewPosts.Yes);
    fastTagPostInFeed([kindTag], articleTitle);
    createQuickPostWithImage(imagePost);
    cy.findFirstPostInFeedFiltered(imagePost, CheckForNewPosts.No, WaitForNewPosts.Yes);
    fastTagPostInFeed([kindTag], imagePost);

    // Reach: All includes profile 4, Following does not, Following does include profile 2.
    openCreateFeedDialog();
    cy.get('[data-cy="custom-feed-name-input"]').type(reachFeed);
    addCustomFeedTag(reachTag);
    chooseCustomFeedOption('reach', 'All');
    saveCustomFeed();
    expectFeedTab(reachFeed);
    expectVisibleReachSelected('all-reach-toggle');
    expectTimelineContains(profile4.postText);
    expectTimelineOmits(profile2.postText);

    openEditFeedDialog(reachFeed);
    chooseCustomFeedOption('reach', 'Following');
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
    chooseCustomFeedOption('reach', 'Friends');
    saveCustomFeed();
    expectVisibleReachSelected('friends-reach-toggle');
    expectTimelineEmpty();

    cy.reload();
    waitForFeedToLoad();
    expectVisibleReachSelected('friends-reach-toggle');
    expectTimelineEmpty();
    cy.get('[data-cy="custom-feed-post-tags"]').should('contain.text', 'p2tag1');

    // Sort: Recent is newest first. Popularity puts the more-tagged post first, and that survives reload.
    goToHomeFeedTab();
    openCreateFeedDialog();
    cy.get('[data-cy="custom-feed-name-input"]').type(sortFeed);
    addCustomFeedTag(sortTag);
    chooseCustomFeedOption('reach', 'Me');
    chooseCustomFeedOption('sort', 'Recent');
    saveCustomFeed();
    expectVisibleReachSelected('me-reach-toggle');
    expectVisibleSortSelected('recent-sort-toggle');
    expectPostOrder(newer, older);

    openEditFeedDialog(sortFeed);
    chooseCustomFeedOption('sort', 'Popularity');
    saveCustomFeed();
    expectVisibleSortSelected('popularity-sort-toggle');
    waitForPopularityOrder(older, newer);
    cy.reload();
    waitForFeedToLoad();
    expectVisibleSortSelected('popularity-sort-toggle');
    waitForPopularityOrder(older, newer);

    // Content: Posts, Articles and Images each keep only that kind. The last edit persists.
    goToHomeFeedTab();
    openCreateFeedDialog();
    cy.get('[data-cy="custom-feed-name-input"]').type(kindFeed);
    addCustomFeedTag(kindTag);
    chooseCustomFeedOption('reach', 'Me');
    chooseCustomFeedOption('content', 'Posts');
    saveCustomFeed();
    expectVisibleContentSelected('Posts');
    expectTimelineContains(shortPost);
    expectTimelineOmits(articleTitle);
    expectTimelineOmits(imagePost);

    openEditFeedDialog(kindFeed);
    chooseCustomFeedOption('content', 'Articles');
    saveCustomFeed();
    expectVisibleContentSelected('Articles');
    expectTimelineContains(articleTitle);
    expectTimelineOmits(shortPost);
    expectTimelineOmits(imagePost);

    openEditFeedDialog(kindFeed);
    chooseCustomFeedOption('content', 'Images');
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
    cy.get('[data-cy="custom-feed-name-input"]').should('have.value', kindFeed);
    cy.get('[data-cy="custom-feed-content-select"]').should('contain.text', 'Images');
    cy.get('[data-cy="custom-feed-reach-select"]').should('contain.text', 'Me');
    cy.get(`[data-cy="post-tag"][data-tag-label="${kindTag}"]`).should('be.visible');
    cy.get('[data-cy="custom-feed-dialog"]').find('[data-cy="dialog-close"]').filter(':visible').click();
    cy.get('[data-cy="custom-feed-dialog"]').should('not.exist');

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

    const photographer = 'Pete the Photographer';

    seedUserViaApi(photographer, { bio: 'I post photos', withRecoveryFile: true }).then((user) => {
      const posts: SeededPost[] = [];
      // create 2 posts with images
      [imagePostContent1, imagePostContent2].forEach((postContent) => {
        createImagePostViaApi(user, postContent).then((post) => {
          posts.push(post);
        });
      });

      // create post with just text
      createPostViaApi(user, textOnlyPostContent).then((post) => {
        posts.push(post);
      });

      // create another post with image (3 posts with images in total)
      createImagePostViaApi(user, imagePostContent3).then((post) => {
        posts.push(post);
      });

      // the text-only post too, so its absence from the visual layout is the filter's doing
      cy.then(() => waitForNexus(...posts.map(postIndexed)));
    });

    cy.signInWithEncryptedFile(backupDownloadFilePath(photographer));

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

describe('custom feed write failures', () => {
  before(() => {
    slowCypressDown();
    cy.deleteDownloadsFolder();
  });

  it('rolls back the new feed tab when homeserver fails to save the feed', () => {
    const stamp = Date.now();
    const feedName = `Doomed feed ${stamp}`;
    const tag = `doomed${String(stamp).slice(-6)}`;
    const feedTab = `[data-cy="feed-navigation-custom-tab"][aria-label="${feedName}"]`;

    cy.onboardAsNewUser('Feed Rollback', 'My feeds fail to save');

    cy.get('[data-cy="feed-navigation"]').find('[data-cy="feed-navigation-create-btn"]').should('be.visible').click();
    cy.get('[data-cy="custom-feed-dialog"]').should('be.visible').and('contain.text', 'Create Feed');
    cy.get('[data-cy="custom-feed-name-input"]').type(feedName);
    cy.get('[data-cy="custom-feed-dialog"]').find('[data-cy="add-tag-input"]').type(`${tag}{enter}`);
    cy.get('[data-cy="custom-feed-dialog"]').find(`[data-cy="post-tag"][data-tag-label="${tag}"]`).should('be.visible');

    cy.intercept('PUT', '**/pub/pubky.app/feeds/**', { statusCode: 500 }).as('feedFailed');
    cy.get('[data-cy="custom-feed-save-btn"]').should('not.be.disabled').click();

    cy.get('[data-cy="toast"]').filter(':visible').should('contain.text', 'Could not create feed. Try again.');
    // homeserver writes retry a 500 twice before giving up
    cy.get('@feedFailed.all').should('have.length', 3);
    // the dialog stays open with the typed values so the user can retry
    cy.get('[data-cy="custom-feed-dialog"]').should('be.visible');
    cy.get('[data-cy="custom-feed-name-input"]').should('have.value', feedName);
    cy.location('pathname').should('eq', '/home');
    cy.get('[data-cy="feed-navigation"]').find(feedTab).should('not.exist');

    // the rolled back local feed row does not come back from Dexie after a reload
    cy.reload();
    cy.get('[data-cy="feed-navigation"]').find('[data-cy="feed-navigation-create-btn"]').should('be.visible');
    cy.get('[data-cy="feed-navigation"]').find(feedTab).should('not.exist');
  });
});
