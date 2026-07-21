import { waitForFeedToLoad } from './posts';

// navigate to the home feed via the header home button
export const goToHomePage = () => {
  cy.get('[data-cy="header-home-btn"]').click();
  cy.location('pathname').should('eq', '/home');
  waitForFeedToLoad();
};

// navigate to the collections landing page via the header library button
export const goToCollectionsPage = () => {
  cy.get('[data-cy="header-collections-btn"]').click();
  cy.location('pathname').should('eq', '/collections');
};

// if not on profile page, navigate to it
export const goToProfilePageFromHeader = () => {
  cy.location('pathname').then((currentPath) => {
    if (currentPath !== '/profile') {
      const profileBtn = Cypress.expose('isMobile')
        ? '[data-cy="footer-nav-profile-btn"]'
        : '[data-cy="header-nav-profile-btn"]';
      cy.get(profileBtn).click();
    }
  });
  cy.location('pathname').should('eq', '/profile');
};
