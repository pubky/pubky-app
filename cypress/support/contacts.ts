import { userIdFromPubky } from './common';
import { clickFollowButton } from './profile';
import { CheckForNewPosts, PostType, WaitForNewPosts } from './types/enums';

/**
 * Follow a user from the post menu on one of their posts in the feed.
 * Use when the target user's post is visible in the feed (e.g. Reach All).
 *
 * @param filterText - Text content to identify the post in the feed
 * @param postType - Whether to target an original post or repost card
 */
export const followFromPostMenu = (filterText: string, postType = PostType.Post) => {
  cy.findPostInFeedByType(postType, filterText, CheckForNewPosts.No).within(() => {
    cy.get('[data-cy="post-more-btn"]').click();
  });
  cy.get('[data-cy="post-menu-action-follow"]').should('be.visible').click();
};

export const searchForProfileByPubky = (pubky: string, profileName: string) => {
  // type pubky into search bar
  cy.get('[data-cy="header-search-input"]').should('be.visible').type(`${pubky}`);

  // wait for autocomplete suggestions to appear and click on the user
  cy.get(`[data-cy="search-user-suggestion-${userIdFromPubky(pubky)}"]`)
    .should('be.visible')
    .click();

  // check that profile page is displayed
  cy.get('[data-cy="profile-username-header"]').should('have.text', profileName);
};

export const searchForProfileByName = (profileName: string) => {
  // type profile name into  search bar
  cy.get('[data-cy="header-search-input"]').type(`${profileName}`);

  // click on profile found in search results
  cy.get('[data-cy="search-users-section"]').contains('div', profileName).first().click();

  // check that profile page is displayed
  cy.get('[data-cy="profile-username-header"]').should('have.text', profileName);
};

export const searchAndFollowProfile = (pubky: string, profileName: string, interceptAlias?: string) => {
  // search for profile
  searchForProfileByPubky(pubky, profileName);

  // Check follow button is displayed for account 1
  cy.get('[data-cy="profile-follow-toggle-btn"]').should('be.visible').and('have.text', 'Follow');

  // for waiting for data to index
  if (interceptAlias) {
    cy.intercept('GET', '**/v0/stream/users/ids*').as(interceptAlias);
  }

  // follow profile
  clickFollowButton();
};
