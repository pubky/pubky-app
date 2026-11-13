import { latestPostInFeedContentEq, createQuickPost } from '../support/posts';
import { searchForProfileByPubky } from '../support/contacts';
import { goToHomePage, goToSettingsPage, goToProfilePageFromHeader, openSettingsSection } from '../support/header';
import { showProfileHeader } from '../support/profile';
import { confirmLogoutBackupBeforeNavigation } from '../support/logout';
import { itMobile } from '../support/mobile';
import { slowCypressDown } from 'cypress-slow-down';
import 'cypress-slow-down/commands';
import { CheckForNewPosts, HasBackedUp } from '../support/types/enums';
import { extendedTimeout } from '../support/common';
import { getNotificationSwitch, leaveEditProfileForSettings, toggleNotificationSwitch } from '../support/settings';

describe('settings', () => {
  before(() => {
    slowCypressDown();
  });

  itMobile('Account settings function correctly', () => {
    const profileName = 'MrAccountSettings';

    const signInFromLogout = (landingPath?: string) => {
      confirmLogoutBackupBeforeNavigation(HasBackedUp.Yes, '#logout-navigation-continue-btn');
      cy.get('#logout-navigation-continue-btn').should('be.visible').click();
      cy.location('pathname').should('eq', '/sign-in');
      cy.signInWithPubkyRing(profileName, landingPath);
    };

    cy.onboardAsNewUser(profileName, 'I like to test account settings');
    goToSettingsPage();

    // Check sign out button
    cy.get('#sign-out-btn').click();
    cy.location('pathname').should('eq', '/logout');

    // Sign back in from the logout page with Pubky Ring
    signInFromLogout();
    goToSettingsPage();

    // Check edit profile button shows edit page
    cy.get('#edit-profile-btn').click();
    cy.get('#profile-name-input').should('be.visible');

    // Navigate back to account settings page
    leaveEditProfileForSettings();

    // Check delete account button shows modal, confirming deletes the account and redirects to logout
    cy.get('#delete-account-btn').click();
    cy.get('[role="dialog"]')
      .should('be.visible')
      .within(() => {
        cy.get('#delete-account-confirm-btn').click();
      });
    // After deletion, we should be redirected to the logout page
    cy.location('pathname').should('eq', '/logout');

    // Sign back in and confirm we are presented with profile creation page
    signInFromLogout('/onboarding/profile');

    // Recreating the deleted profile must show Experience again for the same pubky.
    cy.get('#profile-name-input').clear().type(profileName);
    cy.get('#profile-finish-btn').click(extendedTimeout());
    cy.location('pathname').should('eq', '/onboarding/tags');
    cy.get('[data-testid="tags-of-interest-form"]').should('be.visible');
  });

  itMobile('Muted users settings displays muted users and hides posts in feed', () => {
    // Create user 1
    cy.onboardAsNewUser('Mr Muted', 'I like to be muted');

    // Post something
    const postContent = `I can be muted! ${Date.now()}`;
    createQuickPost(postContent);

    // Copy and store pubky for account 1
    goToProfilePageFromHeader();
    showProfileHeader();
    cy.get('[data-cy="profile-copy-pubkey-btn"]').filter(':visible').should('have.length', 1).click();
    cy.saveCopiedPubkyToAlias('pubky1');
    cy.get('@pubky1').then((ss) => {
      cy.log(`pubky1: ${ss}`);
    });

    // Sign out
    cy.signOut(HasBackedUp.Yes);

    // Create user 2
    cy.onboardAsNewUser('Mr Mute', 'I like to mute people');

    // View user 1's post
    cy.findFirstPostInFeedFiltered(postContent, CheckForNewPosts.Yes);
    latestPostInFeedContentEq(postContent);

    // Confirm that no users are muted yet in settings page
    goToSettingsPage();
    openSettingsSection('mutedUsers');
    cy.get('[data-cy="muted-users-root"]').within(() => {
      cy.contains('No muted users yet').should('be.visible');
    });

    // Mute user 1
    cy.get('@pubky1').then((text) => {
      searchForProfileByPubky(`${text}`, 'Mr Muted');
    });
    cy.intercept('PUT', '**/priv/social/v1/mutes/**').as('createMute');
    cy.intercept('PUT', '**/pub/**/mutes/**').as('publicMute');
    cy.get('[data-cy="profile-menu-btn"]').click();
    cy.get('[data-cy="profile-menu-action-mute"]').click();
    cy.wait('@createMute').its('response.statusCode').should('eq', 201);
    // A mute is private, in no public layout beside the private one
    cy.get('@publicMute.all').should('have.length', 0);

    // Check user 1's post is no longer seen in feed
    goToHomePage();
    cy.get('[data-cy="timeline-container"]').should('not.contain.text', postContent);

    // Confirm user 1 is now muted in settings page and unmute them
    goToSettingsPage();
    openSettingsSection('mutedUsers');
    cy.get('[data-cy="muted-users-root"]').within(() => {
      cy.contains('Mr Muted').should('be.visible');
      cy.get('#unmute-btn').click();
    });

    // Check user 1's post is seen in feed again
    goToHomePage();
    latestPostInFeedContentEq(postContent);
  });

  itMobile('can save changes to notification settings', () => {
    // Create a new user; the seed tasks keep its key in memory under the profile name for this Cypress run
    cy.onboardAsNewUser('MrNotifications', 'I like to test notification settings');

    const navigateToNotificationsPage = () => {
      goToSettingsPage();
      openSettingsSection('notifications');
      cy.location('pathname').should('eq', '/settings/notifications');
    };

    navigateToNotificationsPage();

    cy.intercept('PUT', '**/priv/app.pubky/v1/settings.json').as('settingsWrite');
    cy.intercept('PUT', '**/pub/**/settings.json').as('publicSettings');

    // Disable some notifications
    toggleNotificationSwitch('follow');
    toggleNotificationSwitch('tagProfile');
    toggleNotificationSwitch('reply');
    toggleNotificationSwitch('postDeleted');

    // Settings go to the app's private namespace, and never back to the public 0.x file
    cy.wait('@settingsWrite').its('response.statusCode').should('eq', 201);
    cy.get('@publicSettings.all').should('have.length', 0);

    // Sign out, sign back in, and navigate to notification settings page
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithPubkyRing('MrNotifications');
    navigateToNotificationsPage();

    const checkNotificationIsEnabled = ($toggle: JQuery<HTMLElement>) => {
      cy.wrap($toggle).should('have.attr', 'data-state', 'checked');
    };

    const checkNotificationIsDisabled = ($toggle: JQuery<HTMLElement>) => {
      cy.wrap($toggle).should('have.attr', 'data-state', 'unchecked');
    };

    // Check notifications remain enabled
    getNotificationSwitch('newFriend').then(checkNotificationIsEnabled);
    getNotificationSwitch('tagPost').then(checkNotificationIsEnabled);
    getNotificationSwitch('mention').then(checkNotificationIsEnabled);
    getNotificationSwitch('repost').then(checkNotificationIsEnabled);
    getNotificationSwitch('postEdited').then(checkNotificationIsEnabled);

    // Check some notifications remain disabled
    getNotificationSwitch('follow').then(checkNotificationIsDisabled);
    getNotificationSwitch('tagProfile').then(checkNotificationIsDisabled);
    getNotificationSwitch('reply').then(checkNotificationIsDisabled);
    getNotificationSwitch('postDeleted').then(checkNotificationIsDisabled);

    // Disable remaining enabled notifications
    toggleNotificationSwitch('newFriend');
    toggleNotificationSwitch('tagPost');
    toggleNotificationSwitch('mention');
    toggleNotificationSwitch('repost');
    toggleNotificationSwitch('postEdited');

    // Sign out, sign back in, and navigate to notification settings page
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithPubkyRing('MrNotifications');
    navigateToNotificationsPage();

    // Check all notifications are disabled
    getNotificationSwitch('newFriend').then(checkNotificationIsDisabled);
    getNotificationSwitch('follow').then(checkNotificationIsDisabled);
    getNotificationSwitch('tagPost').then(checkNotificationIsDisabled);
    getNotificationSwitch('tagProfile').then(checkNotificationIsDisabled);
    getNotificationSwitch('mention').then(checkNotificationIsDisabled);
    getNotificationSwitch('repost').then(checkNotificationIsDisabled);
    getNotificationSwitch('reply').then(checkNotificationIsDisabled);
    getNotificationSwitch('postEdited').then(checkNotificationIsDisabled);
    getNotificationSwitch('postDeleted').then(checkNotificationIsDisabled);

    // Enable some notifications
    toggleNotificationSwitch('follow');
    toggleNotificationSwitch('tagProfile');
    toggleNotificationSwitch('postDeleted');

    // Sign out, sign back in, and navigate to notification settings page
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithPubkyRing('MrNotifications');
    navigateToNotificationsPage();

    // Check some notifications remain enabled
    getNotificationSwitch('follow').then(checkNotificationIsEnabled);
    getNotificationSwitch('tagProfile').then(checkNotificationIsEnabled);
    getNotificationSwitch('postDeleted').then(checkNotificationIsEnabled);

    // Check some notifications remain disabled
    getNotificationSwitch('newFriend').then(checkNotificationIsDisabled);
    getNotificationSwitch('tagPost').then(checkNotificationIsDisabled);
    getNotificationSwitch('mention').then(checkNotificationIsDisabled);
    getNotificationSwitch('repost').then(checkNotificationIsDisabled);
    getNotificationSwitch('reply').then(checkNotificationIsDisabled);
    getNotificationSwitch('postEdited').then(checkNotificationIsDisabled);
  });
});
