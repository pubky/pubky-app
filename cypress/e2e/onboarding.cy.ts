import { slowCypressDown } from 'cypress-slow-down';
import { extendedTimeout } from '../support/common';
import { goToProfilePageFromHeader } from '../support/header';
import { createQuickPost, waitForFeedToLoad } from '../support/posts';
import { expectFeedTab, expectVisibleReachSelected, getFeedNavigationItem } from '../support/feeds';
import { addProfileTags, openProfileTab, showProfileHeader } from '../support/profile';
import { itMobile } from '../support/mobile';
import { postIndexed, waitForNexus } from '../support/nexus';
import { createPostViaApi, seedUserViaApi, signUpViaApi } from '../support/seed';
import { CheckForNewPosts, HasBackedUp, OnboardingExperience } from '../support/types/enums';

// A fresh signup token from the homeserver admin API, as the suite hands them out to testers
const fetchInviteCode = () =>
  cy.env(['homeserverAdminUrl', 'homeserverAdminPassword']).then(({ homeserverAdminUrl, homeserverAdminPassword }) =>
    cy
      .request({
        method: 'GET',
        url: homeserverAdminUrl,
        headers: {
          'X-Admin-Password': homeserverAdminPassword,
        },
      })
      .then((response) => response.body as string),
  );

// The Install step only offers Pubky Ring now that the browser no longer creates keys
const expectInstallStepOffersPubkyRingOnly = () => {
  cy.location('pathname').should('eq', '/onboarding/install');
  cy.get('#continue-with-pubky-ring-btn').should('be.visible');
  cy.get('#create-keys-in-browser-btn').should('not.exist');
};

const waitUntilStarterPackHasUsers = (tag: string) => {
  cy.env(['nexusUrl']).then(({ nexusUrl }) => {
    // The deadline starts when the poll runs: this wait is queued behind a full onboarding,
    // so a Date.now() at the call can be spent before the first request.
    const deadline = Date.now() + 90_000;
    const nexusOrigin = String(nexusUrl).replace(/\/$/, '');
    const poll = () => {
      cy.request({
        url: `${nexusOrigin}/v0/stream/users/ids?source=starter_pack&tags=${encodeURIComponent(tag)}&skip=0&limit=10`,
        failOnStatusCode: false,
      }).then((response) => {
        const ids = Array.isArray(response.body) ? response.body : [];
        if (ids.length > 0) return;
        if (Date.now() >= deadline) {
          throw new Error(`Nexus starter_pack did not index ${tag}`);
        }
        cy.wait(2000);
        poll();
      });
    };
    poll();
  });
};

describe('Onboarding', () => {
  before(() => {
    slowCypressDown();
  });

  beforeEach(() => {
    cy.visit('/');
    checkHeaderIsVisible();
  });

  const checkOwnProfile = (profileName: string, profileBio: string) => {
    goToProfilePageFromHeader();
    cy.location('pathname').should('eq', '/profile');
    showProfileHeader();
    cy.get('[data-cy="profile-username-header"]').filter(':visible').should('have.text', profileName);
    cy.get('[data-cy="profile-bio-header"]')
      .filter(':visible')
      .should(($bio) => {
        expect($bio.get(0).innerText.trim()).to.eq(profileBio);
      });
  };

  const checkHeaderIsVisible = () => {
    cy.get('header').should('exist').should('be.visible');
    cy.get('[data-cy="header-sign-in-btn"]').should('exist').should('be.visible');
  };

  itMobile(
    'can onboard a new Pubky Ring key from the profile step, sign out, then sign back in with Pubky Ring',
    () => {
      const profileName = 'Test User';
      const profileBio = 'Test Bio';

      cy.onboardAsNewUser(profileName, profileBio);

      // a key held in Pubky Ring is not reminded to back up on the home feed
      cy.location('pathname').should('eq', '/home');
      cy.get('[data-cy="timeline-container"]').should('be.visible');
      cy.get('#backup-btn').should('not.exist');
      checkOwnProfile(profileName, profileBio);

      cy.signOut(HasBackedUp.Yes);

      cy.signInWithPubkyRing(profileName);
      checkOwnProfile(profileName, profileBio);

      cy.signOut(HasBackedUp.Yes);
    },
  );

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

  it('suggests people for a chosen interest, follows them all, and lands on the My network feed', () => {
    // Docker Nexus has no popular-tag chips. Seed a user who owns this tag so
    // starter_pack can return a match after the next signup types it in.
    const interestTag = `e2e${Date.now().toString().slice(-8)}`;

    cy.onboardAsNewUser('Tagged Seed');
    createQuickPost(`Seed post for ${interestTag}`, [interestTag]);
    cy.findFirstPostInFeed(CheckForNewPosts.Yes);
    goToProfilePageFromHeader();
    openProfileTab('tagged');
    addProfileTags([interestTag]);
    waitUntilStarterPackHasUsers(interestTag);
    cy.signOut(HasBackedUp.Yes);

    cy.onboardAsNewUser('Interested User', '', undefined, OnboardingExperience.StopAtTags);

    cy.get('[data-testid="tags-of-interest-form"]').within(() => {
      cy.get('[data-testid="popular-interests-empty"], [data-testid^="popular-tag-"]', extendedTimeout()).should(
        'exist',
      );
      cy.get('[data-cy="add-tag-input"]').type(`${interestTag}{enter}`);
      // Seeded tags often land in Popular interests; otherwise they show as a custom chip
      cy.get(
        `[data-testid="popular-tag-${interestTag}"][aria-pressed="true"], [data-testid="interest-tag-${interestTag}"]`,
      ).should('be.visible');
      cy.get('#profile-finish-btn').click();
    });

    cy.location('pathname').should('eq', '/onboarding/follow');
    cy.get('[data-cy="follow-best-matches-form"]').should('be.visible');
    cy.get('[data-cy="suggested-user-card"]', extendedTimeout()).should('have.length.greaterThan', 0);

    // Follow all: every card flips to following and the button disappears once nothing is left to follow
    cy.get('[data-cy="follow-all-btn"]').should('contain.text', 'Follow all (').click();
    cy.get('[data-cy="follow-all-btn"]', extendedTimeout()).should('not.exist');
    cy.get('[data-cy="suggested-user-card"]').each(($card) => {
      cy.wrap($card)
        .find('[data-cy="user-list-item-follow-toggle-btn"]')
        .invoke('attr', 'aria-label')
        .should('match', /^Unfollow /);
    });

    cy.finishFollowBestMatchesStep();

    // With at least one follow the landing feed is My network
    expectVisibleReachSelected('network-reach-toggle');

    // Choosing interests creates an Interests custom feed (#2508)
    expectFeedTab('Interests');
  });

  it('shows most active people without interests and lands on the All feed after finishing', () => {
    cy.onboardAsNewUser('Undecided User', '', undefined, OnboardingExperience.StopAtTags);

    // Continue with zero tags
    cy.get('[data-testid="tags-of-interest-form"]').within(() => {
      cy.get('#profile-finish-btn').click();
    });

    cy.location('pathname').should('eq', '/onboarding/follow');
    cy.get('[data-cy="suggested-user-card"]', extendedTimeout()).should('have.length.greaterThan', 0);

    // Finish writes the Interests feed before it navigates, so any feed write happens before /home.
    cy.intercept('PUT', '**/pub/pubky.app/feeds/**').as('feedPut');
    cy.finishFollowBestMatchesStep();

    // With zero follows the landing feed stays on All
    expectVisibleReachSelected('all-reach-toggle');

    // No interest tags means no Interests feed (#2508)
    cy.get('@feedPut.all').should('have.length', 0);
    getFeedNavigationItem('[data-cy="feed-navigation-home-tab"]').should('be.visible');
    getFeedNavigationItem('[data-cy="feed-navigation-create-btn"]').should('be.visible');
    cy.get('[data-cy="feed-navigation"]')
      .find('[data-cy="feed-navigation-custom-tab"][aria-label="Interests"]')
      .should('not.exist');
  });

  itMobile('can use Explore mode without signing in and shows Join Pubky dialog when clicking new post button', () => {
    // A fresh stack has no posts until a test makes one, and phones skip the tests that do
    seedUserViaApi('Explore Poster').then((poster) => {
      createPostViaApi(poster, 'A post to explore before joining').then((post) => {
        waitForNexus(postIndexed(post));
      });
    });

    // Explore lives in the navbar on desktop and in the hero action row below `md`
    const exploreBtn = Cypress.expose('isMobile') ? '[data-cy="explore-btn"]' : '#header-explore-btn';
    cy.get(exploreBtn).should('be.visible').click();

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

  itMobile('signs up a new Pubky Ring key with an invite code through the scan QR and completes onboarding', () => {
    const profileName = 'Ring Signup User';

    cy.get('#create-account-btn').click();
    cy.location('pathname').should('eq', '/onboarding/human');

    // Click 'enter invite code' button
    cy.get('[data-cy="invite-code-link"]').should('exist').click();

    fetchInviteCode().then((inviteCode) => {
      cy.get('[data-cy="human-invite-code-input"]').type(inviteCode);
    });
    cy.get('[data-cy="human-invite-code-continue-btn"]').should('not.be.disabled').click();

    expectInstallStepOffersPubkyRingOnly();
    cy.get('#continue-with-pubky-ring-btn').click();

    // Pubky Ring creates the key and signs it up with the invite code carried by the scan request
    cy.completeSignUpWithPubkyRing(profileName);

    goToProfilePageFromHeader();
    showProfileHeader();
    cy.get('[data-cy="profile-username-header"]').filter(':visible').should('have.text', profileName);

    // the key Ring signed up is the account: signing back in with it lands on the home feed
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithPubkyRing(profileName);
  });

  it('cannot proceed with a reused invite code', () => {
    cy.intercept('GET', '**/signup_tokens/*').as('verifyInviteCode');

    // A sign-up consumes its invite code (here through the homeserver API, as Pubky Ring would)
    signUpViaApi('Reused Invite User').then(({ inviteCode }) => {
      // Reuse that invite code; homeserver should report it as used
      cy.get('#create-account-btn').click();
      cy.location('pathname').should('eq', '/onboarding/human');
      cy.get('[data-testid="human-dev-invite-code-btn"]').should('exist').click();

      cy.get('[data-cy="human-invite-code-input"]').type(inviteCode);
      cy.wait('@verifyInviteCode');
      cy.get('[data-cy="toast"]').should('be.visible').and('contain', 'Invite code already used');
      cy.get('[data-cy="human-invite-code-continue-btn"]').should('be.disabled');
      cy.location('pathname').should('eq', '/onboarding/human');
    });
  });

  itMobile('applies the invite code from an /invite/<code> URL and continues to the Pubky Ring install step', () => {
    fetchInviteCode().then((inviteCode) => {
      cy.visit(`/invite/${inviteCode}`);
    });

    cy.get('[data-cy="toast"]').should('be.visible').and('contain', 'Invite code applied');
    expectInstallStepOffersPubkyRingOnly();
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
