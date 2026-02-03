import { slowCypressDown } from 'cypress-slow-down';
import { BackupType, HasBackedUp } from '../support/types/enums';
import { backupDownloadFilePath } from '../support/common';

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
    cy.get('#header-sign-in-btn').should('exist').should('be.visible');
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

  it('cannot proceed with unauthorised invite code', () => {
    // Intercept the signup request to the homeserver (POST .../signup?signup_token=...)
    cy.intercept('POST', '**/signup*').as('signupRequest');

    // Start onboarding flow
    cy.get('#create-account-btn').click();
    cy.location('pathname').should('eq', '/onboarding/human');

    // Click 'enter invite code' button
    cy.get('[data-testid="human-dev-invite-code-btn"]').should('exist').click();

    // Enter invalid invite code
    cy.get('[data-cy="human-invite-code-input"]').type('abcd-efgh-ijkl');

    // Click continue button
    cy.get('[data-cy="human-invite-code-continue-btn"]').click();

    // Wait for the signup request and verify 401 Unauthorised response
    cy.wait('@signupRequest').its('response.statusCode').should('eq', 401);

    // Assert error toast is shown with appropriate message
    cy.get('[data-cy="toast"]').should('be.visible').and('contain', 'Invalid or expired invite code');

    // Assert still on onboarding/human page (user cannot proceed)
    cy.location('pathname').should('eq', '/onboarding/human');

    // Verify the continue button is enabled again (not stuck in loading state)
    cy.get('[data-cy="human-invite-code-continue-btn"]').should('not.be.disabled');
  });
});
