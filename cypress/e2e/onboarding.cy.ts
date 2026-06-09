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

  it('cannot proceed with unverified invite code', () => {
    // Intercept invite code verification (GET .../signup_tokens/<code>)
    cy.intercept('GET', '**/signup_tokens/*', { statusCode: 404 }).as('verifyInviteCode');

    // Start onboarding flow
    cy.get('#create-account-btn').click();
    cy.location('pathname').should('eq', '/onboarding/human');

    // Click 'enter invite code' button
    cy.get('[data-testid="human-dev-invite-code-btn"]').should('exist').click();

    // Enter invalid invite code - verification runs automatically when the full code is entered
    cy.get('[data-cy="human-invite-code-input"]').type('abcd-efgh-ijkl');

    cy.wait('@verifyInviteCode');

    // Assert invalid invite code toast is shown
    cy.get('[data-cy="toast"]').should('be.visible').and('contain', 'Invalid invite code');

    // Continue stays disabled and the user remains on the invite code step
    cy.get('[data-cy="human-invite-code-continue-btn"]').should('be.disabled');
    cy.location('pathname').should('eq', '/onboarding/human');
  });

  it('cannot proceed with a reused invite code', () => {
    const profileName = 'Reused Invite User';
    const signupTokensPath = '/signup_tokens/';
    let capturedInviteCode = '';

    // Pass verification through to the homeserver and capture the invite code from the request URL.
    cy.intercept('GET', '**/signup_tokens/*', (req) => {
      const tokenStart = req.url.indexOf(signupTokensPath);
      if (tokenStart !== -1) {
        const encodedToken = req.url.slice(tokenStart + signupTokensPath.length).split('?')[0];
        capturedInviteCode = decodeURIComponent(encodedToken);
      }
      req.continue();
    }).as('verifyInviteCode');

    // First signup: homeserver verifies the fresh code as valid
    cy.onboardAsNewUser(profileName);
    cy.signOut(HasBackedUp.Yes);

    // Second signup: reuse the captured invite code; homeserver should report it as used
    cy.get('#create-account-btn').click();
    cy.location('pathname').should('eq', '/onboarding/human');
    cy.get('[data-testid="human-dev-invite-code-btn"]').should('exist').click();

    cy.then(() => {
      expect(capturedInviteCode, 'invite code captured from first verification').to.be.a('string').and.not.be.empty;
      cy.get('[data-cy="human-invite-code-input"]').type(capturedInviteCode);
      cy.wait('@verifyInviteCode');
      cy.get('[data-cy="toast"]').should('be.visible').and('contain', 'Invite code already used');
      cy.get('[data-cy="human-invite-code-continue-btn"]').should('be.disabled');
      cy.location('pathname').should('eq', '/onboarding/human');
    });
  });

  it('can sign up via /invite/<code> URL', () => {
    const profileName = 'Invite URL User';

    cy.env(['homeserverAdminUrl', 'homeserverAdminPassword']).then(
      ({ homeserverAdminUrl, homeserverAdminPassword }) => {
        cy.request({
          method: 'GET',
          url: homeserverAdminUrl,
          headers: {
            'X-Admin-Password': homeserverAdminPassword,
          },
        }).then((response) => {
          const inviteCode = response.body as string;

          cy.visit(`/invite/${inviteCode}`);
          cy.location('pathname').should('eq', '/onboarding/install');
          cy.get('[data-cy="toast"]').should('be.visible').and('contain', 'Invite code applied');
          cy.get('#create-keys-in-browser-btn').should('be.visible');

          cy.completeOnboardingFromInstall(profileName);
        });
      },
    );
  });

  it('redirects home when /invite/<code> verification returns 404', () => {
    cy.intercept('GET', '**/signup_tokens/*', { statusCode: 404 }).as('verifyInviteCode');

    cy.visit('/invite/abcd-efgh-ijkl');

    cy.wait('@verifyInviteCode');
    cy.location('pathname').should('eq', '/');
    cy.get('[data-cy="toast"]').should('be.visible').and('contain', 'Invalid invite code');
    checkHeaderIsVisible();
  });
});
