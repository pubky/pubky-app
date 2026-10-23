import { latestPostInFeedContentEq, createQuickPost, waitForFeedToLoad } from '../support/posts';
import { searchForProfileByPubky } from '../support/contacts';
import { goToHomePage, goToSettingsPage, goToProfilePageFromHeader, openSettingsSection } from '../support/header';
import { showProfileHeader } from '../support/profile';
import { confirmLogoutBackupBeforeNavigation } from '../support/logout';
import { slowCypressDown } from 'cypress-slow-down';
import 'cypress-slow-down/commands';
import { BackupType, CheckForNewPosts, HasBackedUp } from '../support/types/enums';
import { backupDownloadFilePath, extendedTimeout } from '../support/common';
import { getNotificationSwitch, leaveEditProfileForSettings, toggleNotificationSwitch } from '../support/settings';

describe('settings', () => {
  before(() => {
    slowCypressDown();
  });

  beforeEach(() => {
    cy.deleteDownloadsFolder();
  });

  it('Account settings function correctly', () => {
    // Create a new user with recovery phrase backup
    const profileName = 'MrAccountSettings';

    const signInFromLogoutWithRecoveryPhrase = () => {
      // Sign back in stays hidden while this browser still holds the onboarding key.
      confirmLogoutBackupBeforeNavigation(HasBackedUp.Yes, '#logout-navigation-continue-btn');
      cy.get('#logout-navigation-continue-btn').should('be.visible').click();
      cy.location('pathname').should('eq', '/sign-in');
      cy.get('#restore-recovery-phrase-btn').click();
      cy.get(`@recoveryPhrase-${profileName}`).then((rp) => {
        const words = `${rp}`.split(' ');
        words.forEach((word, idx) => {
          cy.get(`#word-slot-input-${idx + 1}`).type(`${word}`);
        });
      });
      cy.get('#recovery-phrase-restore-btn').click();
    };

    cy.onboardAsNewUser(profileName, 'I like to test account settings', [BackupType.RecoveryPhraseWithConfirmation]);
    goToSettingsPage();

    // Check sign out button
    cy.get('#sign-out-btn').click();
    cy.location('pathname').should('eq', '/logout');

    // Sign in with recovery phrase saved from onboarding
    signInFromLogoutWithRecoveryPhrase();
    cy.location('pathname').should('eq', '/home');
    waitForFeedToLoad();
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
    signInFromLogoutWithRecoveryPhrase();
    cy.location('pathname').should('eq', '/onboarding/profile');

    // Recreating the deleted profile must show Experience again for the same pubky.
    cy.get('#profile-name-input').clear().type(profileName);
    cy.get('#profile-finish-btn').click(extendedTimeout());
    cy.location('pathname').should('eq', '/onboarding/tags');
    cy.get('[data-testid="tags-of-interest-form"]').should('be.visible');
  });

  it('Muted users settings displays muted users and hides posts in feed', () => {
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
    cy.signOut(HasBackedUp.No);

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
    cy.get('[data-cy="profile-menu-btn"]').click();
    cy.get('[data-cy="profile-menu-action-mute"]').click();

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

  it('can save changes to notification settings', () => {
    // Create a new user with encrypted file backup (profile name used for backup filename)
    cy.onboardAsNewUser('MrNotifications', 'I like to test notification settings', [BackupType.EncryptedFile]);

    const navigateToNotificationsPage = () => {
      goToSettingsPage();
      openSettingsSection('notifications');
      cy.location('pathname').should('eq', '/settings/notifications');
    };

    navigateToNotificationsPage();

    // Disable some notifications
    toggleNotificationSwitch('follow');
    toggleNotificationSwitch('tagProfile');
    toggleNotificationSwitch('reply');
    toggleNotificationSwitch('postDeleted');

    // Sign out, sign back in, and navigate to notification settings page
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath('MrNotifications'));
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
    cy.signInWithEncryptedFile(backupDownloadFilePath('MrNotifications'));
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
    cy.signInWithEncryptedFile(backupDownloadFilePath('MrNotifications'));
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
