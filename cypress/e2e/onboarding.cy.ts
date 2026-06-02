import { slowCypressDown } from 'cypress-slow-down';
import { BackupType, HasBackedUp } from '../support/types/enums';
import { backupDownloadFilePath } from '../support/common';
import { waitForFeedToLoad } from '../support/posts';

describe('Onboarding', () => {
  before(() => {
    slowCypressDown();
  });

  beforeEach(() => {
    cy.deleteDownloadsFolder();
    cy.visit('/');
    checkHeaderIsVisible();
  });

  const checkHeaderIsVisible = () => {
    cy.get('header').should('exist').should('be.visible');
    cy.get('[data-cy="header-sign-in-btn"]').should('exist').should('be.visible');
  };

  it('can onboard as a new user backing up with encrypted file and recovery phrase, sign out, then sign in with both methods', () => {
    // profile name is also used for the backup file name
    const profileName = 'Test User';
    const backupWithFileAndPhrase = [BackupType.EncryptedFile, BackupType.RecoveryPhraseWithConfirmation];

    cy.onboardAsNewUser(profileName, 'Test Bio', backupWithFileAndPhrase);

    // confirm backup reminder is shown
    cy.get('#backup-btn').should('exist').click();
    // confirm backup dialog can be shown and closed
    cy.get('#backup-dialog-title').should('exist');
    cy.get('[data-testid="dialog-close"]').click();
    // confirm backup done button can be clicked
    cy.get('#backup-done-btn').click();
    // confirm backup confirmation dialog can be shown and dismissed
    cy.get('#backup-done-warning-text').should('exist');
    cy.get('#backup-done-confirm-btn').click();
    // confirm backup reminder is not shown
    cy.get('#backup-btn').should('not.exist');

    cy.signOut(HasBackedUp.Yes);

    cy.signInWithEncryptedFile(backupDownloadFilePath(profileName));

    cy.signOut(HasBackedUp.Yes);

    cy.get(`@recoveryPhrase-${profileName}`).then((recoveryPhrase) => {
      cy.signInWithRecoveryPhrase(recoveryPhrase.toString());
    });

    cy.signOut(HasBackedUp.Yes);
    // todo: check users profile has correctly saved before sign out once implemented
  });

  it('can sign up, sign out, then sign up again as a new user', () => {
    const firstProfileName = 'First User';
    const secondProfileName = 'Second User';

    // sign up as first user
    cy.onboardAsNewUser(firstProfileName);

    // sign out
    cy.signOut(HasBackedUp.Yes);

    // verify we're back at the home page and can sign up again
    cy.location('pathname').should('eq', '/');
    checkHeaderIsVisible();

    // sign up as second user
    cy.onboardAsNewUser(secondProfileName);
  });

  it('can use Explore mode without signing in and shows Join Pubky dialog when clicking new post button', () => {
    cy.get('[data-cy="explore-btn"]').should('be.visible').click();

    waitForFeedToLoad();

    cy.location('pathname').should('eq', '/home');
    cy.get('[data-cy="timeline-container"]').should('be.visible');

    cy.get('[data-cy="new-post-btn"]').should('be.visible').click();
    cy.get('[data-cy="dialog-content"]').should('be.visible').and('contain.text', 'Join Pubky');
  });

  it('cannot proceed with unauthorised invite code', () => {
    // Intercept the signup request to the homeserver (POST .../signup?signup_token=...)
    cy.intercept('POST', '**/signup*').as('signupRequest');

    // Start onboarding flow
    cy.get('#create-account-btn').click();
    cy.location('pathname').should('eq', '/onboarding/human');

    // Click 'enter invite code' button
    cy.get('[data-testid="human-dev-invite-code-btn"]').should('exist').click();

    // Enter invalid invite code (code is stored but not validated until pubky step)
    cy.get('[data-cy="human-invite-code-input"]').type('abcd-efgh-ijkl');

    // Click continue button - navigates to install page (no signup request yet)
    cy.get('[data-cy="human-invite-code-continue-btn"]').click();
    cy.location('pathname').should('eq', '/onboarding/install');

    // Choose to create keys in browser
    cy.get('#create-keys-in-browser-btn').click();
    cy.location('pathname').should('eq', '/onboarding/pubky');

    // Verify pubky display is visible
    cy.get('[data-cy="pubky-display"]').should('be.visible');

    // Click continue on pubky page - this triggers the actual signup request with the invalid invite code
    cy.get('#public-key-navigation-continue-btn').click();

    // Wait for the signup request and verify 401 Unauthorised response
    cy.wait('@signupRequest').its('response.statusCode').should('eq', 401);

    // Assert error toast is shown with appropriate message
    cy.get('[data-cy="toast"]').should('be.visible').and('contain', 'Invalid or expired invite code');

    // Assert still on onboarding/pubky page (user cannot proceed)
    cy.location('pathname').should('eq', '/onboarding/pubky');

    // Verify the continue button is enabled again (not stuck in loading state)
    cy.get('#public-key-navigation-continue-btn').should('not.be.disabled');
  });
});
