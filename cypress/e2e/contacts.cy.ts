import { slowCypressDown } from 'cypress-slow-down';
import { BackupType, HasBackedUp } from '../support/types/enums';
import { goToProfilePageFromHeader } from '../support/header';
import { searchAndFollowProfile } from '../support/contacts';

// cy.visit(`/profile/${pubky}`);
describe('contacts', () => {
  before(() => {
    slowCypressDown();
    cy.deleteDownloadsFolder();
  });

  // todo
  it.skip('can follow and unfollow');

  it('follow, be followed, and make a friend', () => {
    const profileName1 = '#1 Friend';
    const profileName2 = '#2 Friend';
    const pubkyAlias1 = 'friend';

    // * create two profiles

    // Create profile 1
    cy.onboardAsNewUser(profileName1, "Man's best friend", [BackupType.RecoveryPhraseWithoutConfirmation], pubkyAlias1);

    // Sign out of profile 1
    cy.signOut(HasBackedUp.Yes);

    // Create profile 2
    cy.onboardAsNewUser(profileName2, "Man's second best friend", [BackupType.RecoveryPhraseWithoutConfirmation]);

    // * search for profile and follow

    cy.get(`@${pubkyAlias1}`).then((pubky) => {
      searchAndFollowProfile(`${pubky}`, profileName1);
    });

    // * check profile 1 shows profile 2 as new follower

    // check followers tab and click it
    cy.get('[data-cy="profile-filter-item-followers"]').should('have.text', 'Followers');
    cy.get('[data-cy="profile-filter-item-followers-count"]').should('have.text', '1').click();

    // check number of listed followers is 1
    cy.get('[data-cy="profile-connections-list"]')
      .children()
      .should('have.length', 1)
      .first()
      .within(() => {
        // check that profile 2 is listed as a follower
        cy.get('[data-cy="profile-follower-item-name"]').should('have.text', profileName2);
        // check 0 tags
        cy.get('[data-cy="profile-follower-item-tags-count"]').should('have.text', 0);
        // check 0 posts
        cy.get('[data-cy="profile-follower-item-posts-count"]').should('have.text', 0);
        // check follower is 'me'
        cy.get('[data-cy="user-list-item-me-btn"]').should('be.visible');
      });

    // check number of listed following is 0
    cy.get('[data-cy="profile-filter-item-following"]').should('have.text', 'Following');
    cy.get('[data-cy="profile-filter-item-following-count"]').should('have.text', 0).click();
    // check message is displayed indicating no following
    cy.get('[data-cy="profile-following-empty"]').should('be.visible').and('contain.text', 'You are the algorithm');

    // check number of listed friends is 0
    cy.get('[data-cy="profile-filter-item-friends"]').should('have.text', 'Friends');
    cy.get('[data-cy="profile-filter-item-friends-count"]').should('have.text', 0).click();
    // check message is displayed indicating no friends
    cy.get('[data-cy="profile-friends-empty"]').should('be.visible').and('contain.text', 'No friends yet');

    // * check profile 2 shows profile 1 as new following

    goToProfilePageFromHeader();

    // check number of listed following is 1
    cy.get('[data-cy="profile-filter-item-following"]').should('have.text', 'Following');
    cy.get('[data-cy="profile-filter-item-following-count"]').should('have.text', 1).click();
    cy.get('[data-cy="profile-connections-list"]')
      .children()
      .should('have.length', 1)
      .first()
      .within(() => {
        // check that profile 1 is listed as a following
        cy.get('[data-cy="profile-follower-item-name"]').should('have.text', profileName1);
        // check 0 tags
        cy.get('[data-cy="profile-follower-item-tags-count"]').should('have.text', 0);
        // check 0 posts
        cy.get('[data-cy="profile-follower-item-posts-count"]').should('have.text', 0);
        // check option to unfollow profile 1
        cy.get('[data-cy="user-list-item-follow-toggle-btn"]')
          .filter(':visible')
          .should('be.visible')
          .and('have.attr', 'aria-label')
          .and('include', 'Unfollow');
      });

    // check number of listed followers is 0
    cy.get('[data-cy="profile-filter-item-followers-count"]').should('have.text', 0).click();
    // check message is displayed indicating no followers
    cy.get('[data-cy="profile-followers-empty"]').should('be.visible').and('contain.text', 'Looking for followers?');

    // check number of listed friends is 0
    cy.get('[data-cy="profile-filter-item-friends-count"]').should('have.text', 0).click();
    // check message is displayed indicating no friends
    cy.get('[data-cy="profile-friends-empty"]').should('be.visible').and('contain.text', 'No friends yet');

    // Sign out
    cy.signOut(HasBackedUp.Yes);

    // * As profile 1, follow profile 2 back and make a friend

    // Sign in profile 1
    cy.get(`@recoveryPhrase-${profileName1}`).then((recoveryPhrase) => {
      cy.signInWithRecoveryPhrase(recoveryPhrase.toString());
    });
    goToProfilePageFromHeader();

    // Check profile 1 (own) profile for follower
    cy.get('[data-cy="profile-filter-item-followers-count"]').should('have.text', 1).click();
    cy.get('[data-cy="profile-connections-list"]')
      .children()
      .should('have.length', 1)
      .first()
      .within(() => {
        // check that profile 2 is listed as a follower
        cy.get('[data-cy="profile-follower-item-name"]').should('have.text', profileName2);
        // check 0 tags
        cy.get('[data-cy="profile-follower-item-tags-count"]').should('have.text', 0);
        // check 0 posts
        cy.get('[data-cy="profile-follower-item-posts-count"]').should('have.text', 0);
        // click follow button to make profile 2 a friend
        cy.get('[data-cy="user-list-item-follow-toggle-btn"]')
          .filter(':visible') // Filter to only the visible button (desktop or mobile)
          .should('be.visible')
          .then(($btn) => {
            expect($btn.attr('aria-label')).to.match(/^Follow\b/);
            cy.wrap($btn).click();
          });
      });

    // check number of listed following is 1
    cy.get('[data-cy="profile-filter-item-following-count"]').should('have.text', 1).click();
    cy.get('[data-cy="profile-connections-list"]')
      .children()
      .should('have.length', 1)
      .first()
      .within(() => {
        // check that profile 2 is listed as a following
        cy.get('[data-cy="profile-follower-item-name"]').should('have.text', profileName2);
      });

    // check number of listed friends is 1
    cy.get('[data-cy="profile-filter-item-friends"]').should('have.text', 'Friends');
    cy.get('[data-cy="profile-filter-item-friends-count"]').should('have.text', 1).click();
    cy.get('[data-cy="profile-connections-list"]')
      .children()
      .should('have.length', 1)
      .first()
      .within(() => {
        // check that profile 2 is listed as a friend
        cy.get('[data-cy="profile-follower-item-name"]').should('have.text', profileName2);
        // check 0 tags
        cy.get('[data-cy="profile-follower-item-tags-count"]').should('have.text', 0);
        // check 0 posts
        cy.get('[data-cy="profile-follower-item-posts-count"]').should('have.text', 0);
        // check option to unfollow profile 1
        cy.get('[data-cy="user-list-item-follow-toggle-btn"]')
          .filter(':visible') // Filter to only the visible button (desktop or mobile)
          .should('be.visible')
          .then(($btn) => {
            expect($btn.attr('aria-label')).to.match(/^Unfollow\b/);
            cy.wrap($btn).click();
          });
      });
  });
});
