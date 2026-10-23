import { isMobile } from './mobile';
import { waitForFeedToLoad } from './posts';

// Phones hide the desktop header; the same destinations live in the mobile footer.
const navButton = (desktopDataCy: string, mobileDataCy: string) =>
  cy
    .get(`[data-cy="${isMobile() ? mobileDataCy : desktopDataCy}"]`)
    .filter(':visible')
    .should('have.length', 1);

// navigate to the home feed via the header home button
export const goToHomePage = () => {
  navButton('header-home-btn', 'footer-nav-home-btn').click();
  cy.location('pathname').should('eq', '/home');
  waitForFeedToLoad();
};

// navigate to the collections landing page via the header library button
export const goToCollectionsPage = () => {
  navButton('header-collections-btn', 'footer-nav-collections-btn').click();
  cy.location('pathname').should('eq', '/collections');
};

// navigate to the account settings page via the header settings button
export const goToSettingsPage = () => {
  navButton('header-settings-btn', 'footer-nav-settings-btn').click();
  cy.location('pathname').should('eq', '/settings/account');
};

// open a settings section from the settings menu (desktop sidebar, mobile tab bar)
export const openSettingsSection = (id: 'account' | 'notifications' | 'privacySafety' | 'mutedUsers' | 'help') => {
  navButton(`settings-menu-item-${id}`, `settings-mobile-tab-${id}`).click();
};

// if not on profile page, navigate to it
export const goToProfilePageFromHeader = () => {
  cy.location('pathname').then((currentPath) => {
    if (currentPath !== '/profile') {
      navButton('header-nav-profile-btn', 'footer-nav-profile-btn').click();
    }
  });
  cy.location('pathname').should('eq', '/profile');
};

// The search input sits in the desktop header; phones only have it on the /search page.
export const getSearchInput = () => {
  if (isMobile()) {
    cy.location('pathname').then((currentPath) => {
      if (currentPath !== '/search') {
        cy.get('[data-cy="footer-nav-search-btn"]').filter(':visible').should('have.length', 1).click();
        cy.location('pathname').should('eq', '/search');
      }
    });
  }
  return cy.get('[data-cy="header-search-input"]').filter(':visible').should('have.length', 1);
};

// The top-left corner is the mobile header on phones, which does not dismiss the suggestions.
export const closeSearchSuggestions = () => {
  if (isMobile()) {
    getSearchInput().type('{esc}');
  } else {
    cy.get('body').click(0, 0);
  }
};

export const getSearchBox = () => cy.get('[data-cy="header-search"]').filter(':visible').should('have.length', 1);

// The notification counter sits on the header profile button (desktop) or footer avatar (mobile).
export const notificationCounterSelector = () =>
  isMobile() ? '[data-cy="mobile-notification-counter"]' : '[data-cy="header-notification-counter"]';
