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
