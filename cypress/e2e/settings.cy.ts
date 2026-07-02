import { latestPostInFeedContentEq, createQuickPost, waitForFeedToLoad } from '../support/posts';
import { searchForProfileByPubky } from '../support/contacts';
import { slowCypressDown } from 'cypress-slow-down';
import 'cypress-slow-down/commands';
import { BackupType, CheckForNewPosts, HasBackedUp } from '../support/types/enums';
import { backupDownloadFilePath } from '../support/common';

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
    cy.get('[data-cy="header-settings-btn"]').click();

    // Check sign out button
    cy.get('#sign-out-btn').click();
    cy.location('pathname').should('eq', '/logout');

    // Sign in with recovery phrase saved from onboarding
    signInFromLogoutWithRecoveryPhrase();
    cy.location('pathname').should('eq', '/home');
    waitForFeedToLoad();
    cy.get('[data-cy="header-settings-btn"]').click();

    // Check edit profile button shows edit page
    cy.get('#edit-profile-btn').click();
    cy.get('#profile-name-input').should('be.visible');

    // Navigate back to account settings page
    cy.get('[data-cy="header-settings-btn"]').click();

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
  });

  it.skip('Privacy and Safety settings is displayed correctly', () => {});

  it('Muted users settings displays muted users and hides posts in feed', () => {
    // Create user 1
    cy.onboardAsNewUser('Mr Muted', 'I like to be muted');

    // Post something
    const postContent = `I can be muted! ${Date.now()}`;
    createQuickPost(postContent);

    // Copy and store pubky for account 1
    cy.get('[data-cy="header-nav-profile-btn"]').click();
    cy.get('[data-cy="profile-copy-pubkey-btn"]').click();
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
    cy.get('[data-cy="header-settings-btn"]').click();
    cy.get('[data-cy="settings-menu-item-mutedUsers"]').click();
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
    cy.get('[data-cy="header-home-btn"]').click();
    cy.get('[data-cy="timeline-container"]').should('not.contain.text', postContent);

    // Confirm user 1 is now muted in settings page and unmute them
    cy.get('[data-cy="header-settings-btn"]').click();
    cy.location('pathname').should('eq', '/settings/account');
    cy.get('[data-cy="settings-menu-item-mutedUsers"]').should('be.visible').click();
    cy.get('[data-cy="muted-users-root"]').within(() => {
      cy.contains('Mr Muted').should('be.visible');
      cy.get('#unmute-btn').click();
    });

    // Check user 1's post is seen in feed again
    cy.get('[data-cy="header-home-btn"]').click();
    latestPostInFeedContentEq(postContent);
  });

  it('can save changes to notification settings', () => {
    // Create a new user with encrypted file backup (profile name used for backup filename)
    cy.onboardAsNewUser('MrNotifications', 'I like to test notification settings', [BackupType.EncryptedFile]);

    const navigateToNotificationsPage = () => {
      cy.get('[data-cy="header-settings-btn"]').click();
      cy.location('pathname').should('eq', '/settings/account');
      cy.get('[data-cy="settings-menu-item-notifications"]').click();
      cy.location('pathname').should('eq', '/settings/notifications');
    };

    navigateToNotificationsPage();

    // Disable some notifications
    cy.get('#notification-switch-follow').click();
    cy.get('#notification-switch-tagProfile').click();
    cy.get('#notification-switch-reply').click();
    cy.get('#notification-switch-postDeleted').click();

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
    cy.get('#notification-switch-newFriend').then(checkNotificationIsEnabled);
    cy.get('#notification-switch-tagPost').then(checkNotificationIsEnabled);
    cy.get('#notification-switch-mention').then(checkNotificationIsEnabled);
    cy.get('#notification-switch-repost').then(checkNotificationIsEnabled);
    cy.get('#notification-switch-postEdited').then(checkNotificationIsEnabled);

    // Check some notifications remain disabled
    cy.get('#notification-switch-follow').then(checkNotificationIsDisabled);
    cy.get('#notification-switch-tagProfile').then(checkNotificationIsDisabled);
    cy.get('#notification-switch-reply').then(checkNotificationIsDisabled);
    cy.get('#notification-switch-postDeleted').then(checkNotificationIsDisabled);

    // Disable remaining enabled notifications
    cy.get('#notification-switch-newFriend').click();
    cy.get('#notification-switch-tagPost').click();
    cy.get('#notification-switch-mention').click();
    cy.get('#notification-switch-repost').click();
    cy.get('#notification-switch-postEdited').click();

    // Sign out, sign back in, and navigate to notification settings page
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath('MrNotifications'));
    navigateToNotificationsPage();

    // Check all notifications are disabled
    cy.get('#notification-switch-newFriend').then(checkNotificationIsDisabled);
    cy.get('#notification-switch-follow').then(checkNotificationIsDisabled);
    cy.get('#notification-switch-tagPost').then(checkNotificationIsDisabled);
    cy.get('#notification-switch-tagProfile').then(checkNotificationIsDisabled);
    cy.get('#notification-switch-mention').then(checkNotificationIsDisabled);
    cy.get('#notification-switch-repost').then(checkNotificationIsDisabled);
    cy.get('#notification-switch-reply').then(checkNotificationIsDisabled);
    cy.get('#notification-switch-postEdited').then(checkNotificationIsDisabled);
    cy.get('#notification-switch-postDeleted').then(checkNotificationIsDisabled);

    // Enable some notifications
    cy.get('#notification-switch-follow').click();
    cy.get('#notification-switch-tagProfile').click();
    cy.get('#notification-switch-postDeleted').click();

    // Sign out, sign back in, and navigate to notification settings page
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath('MrNotifications'));
    navigateToNotificationsPage();

    // Check some notifications remain enabled
    cy.get('#notification-switch-follow').then(checkNotificationIsEnabled);
    cy.get('#notification-switch-tagProfile').then(checkNotificationIsEnabled);
    cy.get('#notification-switch-postDeleted').then(checkNotificationIsEnabled);

    // Check some notifications remain disabled
    cy.get('#notification-switch-newFriend').then(checkNotificationIsDisabled);
    cy.get('#notification-switch-tagPost').then(checkNotificationIsDisabled);
    cy.get('#notification-switch-mention').then(checkNotificationIsDisabled);
    cy.get('#notification-switch-repost').then(checkNotificationIsDisabled);
    cy.get('#notification-switch-reply').then(checkNotificationIsDisabled);
    cy.get('#notification-switch-postEdited').then(checkNotificationIsDisabled);
  });

  it.skip('Language settings: new language can be selected', () => {});

  it.skip('Help: FAQ is displayed correctly', () => {});

  it.skip('Help: User Guide can be navigated to', () => {});

  it.skip('Help: Support link can be used', () => {});
});
