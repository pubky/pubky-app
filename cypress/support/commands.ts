// <reference types="cypress" />

import { extendedTimeout, waitForServiceWorker } from './common';
import { goToProfilePageFromHeader } from './header';
import { isMobile } from './mobile';
import { showProfileHeader } from './profile';
import { confirmLogoutBackupBeforeNavigation } from './logout';
import { waitForFeedToLoad } from './posts';
import { approvePubkyAuthViaApi, signUpViaApi, signUpWithPubkyAuthViaApi } from './seed';
import { CheckForNewPosts, HasBackedUp, OnboardingExperience, PostType, WaitForNewPosts } from './types/enums';
// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

// TypeScript's DOM types do not include the Navigation API yet
type NavigationApi = {
  addEventListener(type: 'navigate', listener: (event: Event & { destination: { url: string } }) => void): void;
};

// Open /sign-in from the homepage, unless already there (e.g. after "Sign back in" on /logout)
function openSignInPage(): void {
  cy.location('pathname').then((pathname) => {
    if (pathname === '/sign-in') return;
    if (pathname !== '/') cy.visit('/');
    cy.location('pathname').should('eq', '/');
    waitForServiceWorker();
    cy.get('[data-cy="header-sign-in-btn"]').click();
  });
  cy.location('pathname').should('eq', '/sign-in');
}

// The app's Pubky Ring request, taken where a user hands it to Ring: the link the desktop QR code
// copies, or the deeplink the mobile "Continue with Pubky Ring" button opens
function readPubkyRingAuthUrl(): Cypress.Chainable<string> {
  if (isMobile()) {
    const deeplink: { url?: string } = {};
    cy.window().then((win) => {
      // Ring is not installed here: cancel the deeplink navigation and keep its URL for the mock Ring
      const navigation: NavigationApi = Reflect.get(win, 'navigation');
      navigation.addEventListener('navigate', (event) => {
        if (!event.destination.url.startsWith('pubkyauth://')) return;
        event.preventDefault();
        deeplink.url = event.destination.url;
      });
    });
    cy.contains('button:visible', 'Continue with Pubky Ring').should('not.be.disabled').click();
    cy.contains('button:visible', 'Opening Pubky Ring...').should('be.disabled');
    return cy.wrap(deeplink).its('url');
  }

  return cy.copyAuthLinkFromQr();
}

// Complete onboarding from the Profile step, where a signed-in key without a profile lands
function completeOnboardingFromProfile(
  profileName: string,
  profileBio: string,
  experience: OnboardingExperience,
): void {
  cy.location('pathname').should('eq', '/onboarding/profile');

  cy.get('#profile-name-input').clear().type(profileName);
  if (profileBio) {
    cy.get('#profile-bio-input').type(profileBio);
  }

  cy.get('#profile-finish-btn').click(extendedTimeout());

  cy.location('pathname').should('eq', '/onboarding/tags');
  cy.get('[data-testid="tags-of-interest-form"]').should('be.visible');

  if (experience === OnboardingExperience.StopAtTags) {
    return;
  }

  cy.get('[data-testid="tags-of-interest-form"]').within(() => {
    cy.get('#profile-finish-btn').click();
  });

  // Follow step: no follows here so the landing feed stays on All for every existing spec
  cy.finishFollowBestMatchesStep();
}

// From /onboarding/follow: wait for suggestions (or the empty state), click Finish, land on /home
// and dismiss the welcome dialog. Does not follow anyone by itself.
Cypress.Commands.add('finishFollowBestMatchesStep', () => {
  cy.location('pathname').should('eq', '/onboarding/follow');
  cy.get('[data-cy="follow-best-matches-form"]').should('be.visible');
  cy.get('[data-testid="suggested-people-grid"], [data-testid="suggested-people-empty"]', extendedTimeout()).should(
    'exist',
  );
  cy.get('[data-cy="follow-best-matches-form"]').within(() => {
    cy.get('#profile-finish-btn').should('not.be.disabled').click();
  });

  cy.location('pathname').should('eq', '/home');

  // confirm welcome message is shown and dismiss it
  cy.get('#welcome-title').should('exist');
  cy.get('#welcome-explore-pubky-btn').click();
});

// Creates a new account the way the product now allows: the key is created and signed up outside
// the browser (Pubky Ring's part, done by the `seedSignUp` task), then the app signs in with Pubky
// Ring and completes onboarding from the Profile step. `cy.signInWithPubkyRing(profileName)` signs
// back in as the account.
Cypress.Commands.add(
  'onboardAsNewUser',
  (
    profileName: string,
    profileBio: string = '',
    pubkyAlias?: string,
    experience: OnboardingExperience = OnboardingExperience.Skip,
  ) => {
    signUpViaApi(profileName).then(({ pubky }) => {
      if (pubkyAlias) storeStringToAlias(pubky, pubkyAlias);
    });

    cy.signInWithPubkyRing(profileName, '/onboarding/profile');

    completeOnboardingFromProfile(profileName, profileBio, experience);
  },
);

// From /onboarding/scan: hands the app's sign-up request to Pubky Ring (the mock Ring creates the key,
// signs it up with the request's invite code and approves), then completes onboarding as a new user
// would from the Profile step. `cy.signInWithPubkyRing(profileName)` signs back in as the account.
Cypress.Commands.add('completeSignUpWithPubkyRing', (profileName: string) => {
  cy.location('pathname').should('eq', '/onboarding/scan');
  // The Install step's "Continue with Pubky Ring" shares the phone button's label; wait for the Scan page
  cy.get('[data-testid="scan-qr-card"]').should('exist');
  readPubkyRingAuthUrl().then((authUrl) => {
    expect(authUrl).to.match(/^pubkyauth:\/\/signup_grant\?/);
    signUpWithPubkyAuthViaApi(profileName, authUrl);
  });

  completeOnboardingFromProfile(profileName, '', OnboardingExperience.Skip);
});

Cypress.Commands.add('signOut', (hasBackedUp: HasBackedUp) => {
  goToProfilePageFromHeader();
  showProfileHeader();

  cy.get('[data-cy="profile-logout-btn"]').filter(':visible').should('have.length', 1).click();
  cy.location('pathname').should('eq', '/logout');

  confirmLogoutBackupBeforeNavigation(hasBackedUp, '#logout-navigation-back-btn');

  // navigate back to onboarding homepage
  cy.get('#logout-navigation-back-btn').click();
  cy.location('pathname').should('eq', '/');
});

// Signs the app in as `name` (signed up by `cy.onboardAsNewUser`, `seedUserViaApi` or `signUpViaApi`)
// through its Pubky Ring flow, with the seed tasks approving in Ring's place. A key with a profile
// lands on /home; one without lands on /onboarding/profile. Every fresh grant passes the social v1
// migration gate (`/migration`) first: a key with no 0.x tree only checks there and moves on, while
// one seeded `legacy` copies its tree there before the landing route (`migrates`).
Cypress.Commands.add(
  'signInWithPubkyRing',
  (name: string, landingPath = '/home', { migrates = false, whileMigrating, acknowledgesSummary = false } = {}) => {
    openSignInPage();
    readPubkyRingAuthUrl().then((authUrl) => {
      expect(authUrl).to.match(/^pubkyauth:\/\//);
      approvePubkyAuthViaApi(name, authUrl);
    });

    // An account with a 0.x tree stops on the gate's progress screen; any other only checks and moves on
    if (migrates) {
      cy.location('pathname').should('eq', '/migration');
      cy.get('[data-testid="social-migration"]').should('contain.text', 'Updating your account');
      // A spec that interrupts the run (a reload, a homeserver that stops answering) does so from here
      whileMigrating?.();
    }
    // A run that left something behind waits on its summary for a click
    if (acknowledgesSummary) {
      cy.get('[data-testid="social-migration"]').should('contain.text', 'Your account is up to date');
      cy.get('#social-migration-summary-navigation-continue-btn').click();
    }
    // A run copies the whole tree before the landing route, and its specs hold some of its answers back
    cy.location('pathname', migrates ? extendedTimeout() : {}).should('eq', landingPath);
    if (landingPath === '/home') waitForFeedToLoad();
  },
);

// Useful when 'should.be' doesn't work due to additional space inserted before final word.
Cypress.Commands.add('innerTextShouldEq', { prevSubject: 'element' }, (subject, text) => {
  cy.wrap(subject).should(($elem) => {
    expect($elem.get(0).innerText).to.eq(text);
  });
});

// Useful when 'should.contain' doesn't work due to additional space inserted before final word.
Cypress.Commands.add('innerTextContains', { prevSubject: 'element' }, (subject, text) => {
  return cy.wrap(subject).then(($elem) => {
    return $elem.get(0).innerText.includes(text);
  });
});

// Useful when 'should.contain' doesn't work due to additional space inserted before final word.
Cypress.Commands.add('innerTextShouldContain', { prevSubject: 'element' }, (subject, text) => {
  cy.wrap(subject).should(($elem) => {
    expect($elem.get(0).innerText).to.contain(text);
  });
});

// Useful when 'should.not.contain' doesn't work due to additional space inserted before final word.
Cypress.Commands.add('innerTextShouldNotContain', { prevSubject: 'element' }, (subject, text) => {
  cy.wrap(subject).should(($elem) => {
    expect($elem.get(0).innerText).to.not.contain(text);
  });
});

// Useful when 'should.not.be' doesn't work due to additional space inserted before final word.
Cypress.Commands.add('innerTextShouldNotEq', { prevSubject: 'element' }, (subject, text) => {
  cy.wrap(subject).should(($elem) => {
    expect($elem.get(0).innerText).to.not.eq(text);
  });
});

// Common helper function to store a string value to an alias and Cypress env
// see https://docs.cypress.io/guides/core-concepts/variables-and-aliases#Sharing-Context
// note: aliases work in the context of as test and only the first test after before
function storeStringToAlias(text: string, alias: string): void {
  // store text as alias
  cy.wrap(text).as(alias);
  // also store text in Cypress env to be used in beforeEach to re-create aliases because they are cleared at end of each test
  // e.g. cy.wrap(Cypress.expose(profile1.pubkyAlias)).as(profile1.pubkyAlias);
  Cypress.expose(alias, text);
}

// Stores a string value to an alias
Cypress.Commands.add('saveStringToAlias', (text: string, alias: string) => {
  if (!text || text.length === 0) {
    throw new Error('Cannot save empty string to alias');
  }
  storeStringToAlias(text, alias);
});

// Reads a value from an element and stores it to an alias
Cypress.Commands.add('saveElementValueToAlias', (selector: string, alias: string) => {
  cy.get(selector)
    .invoke('val')
    .then((text) => {
      const value = text as string;
      if (!value || value.length === 0) {
        throw new Error(`Unable to read value from ${selector}`);
      }
      cy.saveStringToAlias(value, alias);
    });
});

// Stores the clipboard contents to an alias for later use
// see https://docs.cypress.io/guides/core-concepts/variables-and-aliases#Sharing-Context
// note: aliases work in the context of as test and only the first test after before
Cypress.Commands.add('saveCopiedPubkyToAlias', (alias: string) => {
  cy.window()
    .then((win) => {
      // ensure focus is on the window before attempting to read clipboard
      win.focus();
      // requires browser to be in focus
      return win.navigator.clipboard.readText().then((text) => {
        // format assertion for `pubky` prefix
        expect(text).to.match(/^pubky/);
        return text;
      });
      // previous 'then' is callback of a promise which doesn't guarantee synchronous execution
      // so an additional 'then' is needed to guarantee the alias is stored before the next test step
    })
    .then((text) => {
      storeStringToAlias(text, alias);
    });
});

// Clicks the visible auth QR code ("Copy authentication link") and yields the link the app copied.
// The link is taken from the app's own `navigator.clipboard.writeText` call rather than read back:
// Cypress cannot grant clipboard-read on WebKit. The write still goes to the real clipboard; if the
// browser refuses it, the call resolves anyway so the app's copy handler runs to its toast.
Cypress.Commands.add('copyAuthLinkFromQr', () => {
  cy.window().then((win) => {
    const { clipboard } = win.navigator;
    // A window that already copied in this test (signing in twice without a reload) still has the stub
    const previousStub: unknown = Reflect.get(clipboard.writeText, 'restore');
    if (typeof previousStub === 'function') previousStub.call(clipboard.writeText);
    const writeText = clipboard.writeText.bind(clipboard);
    cy.stub(clipboard, 'writeText')
      .callsFake((text: string) => writeText(text).catch(() => undefined))
      .as('clipboardWriteText');
  });

  cy.get('button[aria-label="Copy authentication link"]:visible').should('not.be.disabled').click();
  cy.get('[data-cy="toast"]').filter(':visible').should('contain.text', 'Authentication link copied');
  return cy.get('@clipboardWriteText').should('have.been.calledOnce').its('firstCall.args.0');
});

Cypress.Commands.add('assertElementDoesNotExist', (selector) => {
  cy.get('body').then(($body) => {
    assert($body.find(selector).length === 0, `${selector} exists. It should not.`);
  });
});

Cypress.Commands.add('waitReload', (time = 2000) => {
  cy.wait(time).reload();
});

// wait for element to appear by default
Cypress.Commands.add('waitReloadWhileElementDoesNotExist', (selector, attempts = 30) => {
  const go = (attempts: number) => {
    if (attempts <= 0) assert(false, `waitReloadWhileElementDoesNotExist: ${selector} not found`);

    cy.get('body').then(($body) => {
      if ($body.find(selector).length === 0) {
        cy.log(`waitReloadWhileElementDoesNotExist: ${selector} not found; waiting and reloading.`);
        cy.wait(1_000);
        cy.reload();
        // wait for page to load before checking again
        // TODO: improve wait by detecting presence of key element on page (e.g. profile picture)
        cy.wait(Cypress.expose('ci') ? 3_000 : 1_000);
        go(attempts - 1);
      } else {
        cy.log(`waitReloadWhileElementDoesNotExist: ${selector} found; continuing.`);
        return;
      }
    });
  };
  cy.log(`waitReloadWhileElementDoesNotExist: starting with selector: ${selector} and attempts: ${attempts}.`);
  go(attempts);
});

Cypress.Commands.add('countPostsInBookmarks', (expectedCount: number) => {
  cy.get('#bookmarked-posts').find('[id="post-container"]').should('have.length', expectedCount);
});

Cypress.Commands.add('findPostInBookmarks', (postIdx: number) => {
  return cy.get('#bookmarked-posts').find('[id="post-container"]').eq(postIdx);
});

const findPostInFeed = (
  postIdx = 0,
  filterText?: string,
  checkForNewPosts = CheckForNewPosts.No,
  waitForNewPosts = WaitForNewPosts.No,
  postType = PostType.Any,
) => {
  var filteredPosts: JQuery<HTMLElement>;
  // find the post in the timeline
  return cy
    .get('[data-cy="timeline-posts"]')
    .find('[data-cy="post-card"]')
    .should('have.length.gt', postIdx)
    .then(($posts): Cypress.Chainable<JQuery<HTMLElement>> => {
      // optionally filter posts by contained text and whether the card itself is a repost
      filteredPosts = $posts.filter((_idx, element) => {
        const matchesText = !filterText || element.innerText.includes(filterText);
        const isRepost = element.querySelector('[data-cy="post-preview-card"]') !== null;
        const matchesPostType = postType === PostType.Any ? true : postType === PostType.Repost ? isRepost : !isRepost;

        return matchesText && matchesPostType;
      });

      // Check if the requested post index exists
      if (filteredPosts.length > postIdx) {
        cy.log(`findPostInFeed: Post found at index ${postIdx} (${filteredPosts.length} matching posts found)`);
        return cy.wrap(filteredPosts.eq(postIdx));
      }
      cy.log(
        `findPostInFeed: Post not found at index ${postIdx} (${filteredPosts.length} matching posts found, ${$posts.length} total posts)`,
      );

      // Post not found - if checkForNewPosts is enabled, try clicking "See new posts" button
      if (checkForNewPosts) {
        cy.log(`Clicking 'See new posts' button to check for new posts`);
        // Check if "See new posts" button exists and click it
        cy.get('[data-cy="new-posts-button"]', { timeout: 30_000 }).should('be.visible').click();
        waitForFeedToLoad();
        // Recursively call findPostInFeed without checking for new posts
        return findPostInFeed(postIdx, filterText, CheckForNewPosts.No, WaitForNewPosts.Yes, postType);
      }

      // Post not found - if waitForNewPosts is enabled, wait for new posts and try again
      if (waitForNewPosts) {
        cy.log(`Waiting for new posts to appear`);
        cy.wait(Cypress.expose('ci') ? 2_000 : 500);
        waitForFeedToLoad();
        return findPostInFeed(postIdx, filterText, checkForNewPosts, WaitForNewPosts.No, postType);
      }

      // fail the test if the post cannot be found
      assert(false, `findPostInFeed: Post not found at index ${postIdx} - Failing test`);
      // return unfound post to satisfy return type
      return cy.wrap(filteredPosts.eq(postIdx));
    });
};

// useful to find your latest new post
Cypress.Commands.add('findFirstPostInFeed', (checkForNewPosts = CheckForNewPosts.No) => {
  return findPostInFeed(0, undefined, checkForNewPosts);
});

// useful for finding a specific post by text
Cypress.Commands.add(
  'findFirstPostInFeedFiltered',
  (filterText, checkForNewPosts = CheckForNewPosts.No, waitForNewPosts = WaitForNewPosts.No) => {
    return findPostInFeed(0, filterText, checkForNewPosts, waitForNewPosts);
  },
);

Cypress.Commands.add(
  'findFirstPostInFeedFilteredByType',
  (
    filterText,
    postType = PostType.Post,
    checkForNewPosts = CheckForNewPosts.No,
    waitForNewPosts = WaitForNewPosts.No,
  ) => {
    return findPostInFeed(0, filterText, checkForNewPosts, waitForNewPosts, postType);
  },
);

// useful for finding a specific post by index with optional filter text
Cypress.Commands.add(
  'findPostInFeed',
  (postIdx = 0, filterText?, checkForNewPosts = CheckForNewPosts.No, waitForNewPosts = WaitForNewPosts.No) => {
    return findPostInFeed(postIdx, filterText, checkForNewPosts, waitForNewPosts);
  },
);

Cypress.Commands.add(
  'findPostInFeedByType',
  (
    postType = PostType.Post,
    filterText?,
    checkForNewPosts = CheckForNewPosts.No,
    waitForNewPosts = WaitForNewPosts.No,
  ) => {
    return findPostInFeed(0, filterText, checkForNewPosts, waitForNewPosts, postType);
  },
);

// useful for finding a specific post card by text in search results
// `filter` and `eq` are query commands, so the whole chain retries until a matching
// card renders (a `.then` callback would capture a stale or still-loading result list)
Cypress.Commands.add('findPostInSearchResults', (filterText?: string, postIdx = 0) => {
  return cy
    .get('[data-cy="post-search-results"]')
    .find('[data-cy="post-card"]')
    .filter((_idx, element) => (filterText ? element.innerText.includes(filterText) : true))
    .eq(postIdx);
});

// To prevent Cypress from failing the test when running pubky-app with dev build:
// `Uncaught SyntaxError: Invalid or unexpected token` on Chrome, and
// `Uncaught SyntaxError: "" literal not terminated before end of script` on firefox.
Cypress.on('uncaught:exception', () => {
  return false;
});
