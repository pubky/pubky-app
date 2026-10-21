export const isMobile = (): boolean => Boolean(Cypress.expose('isMobile'));

// For features the phone layout does not offer (e.g. the layout filter), not for mobile failures.
export const itDesktopOnly: Mocha.TestFunction | Mocha.PendingTestFunction = isMobile() ? it.skip : it;

export type DrawerSide = 'left' | 'right';

// The drawer has no close button and ignores Escape; a phone user taps the dimmed area beside it.
// The tap targets the overlay (backdrop plus panel), since Cypress judges a fixed backdrop by its
// centre, which the panel covers. The far edge is outside the panel, so the tap lands on the backdrop.
export const closeSideDrawer = (side: DrawerSide) => {
  cy.get(`[data-cy="side-drawer-${side}-overlay"]`).click(side === 'left' ? 'right' : 'left');
  cy.get(`[data-cy="side-drawer-${side}"]`).should('not.exist');
};

/**
 * Run `action` against the content of a layout sidebar. Desktop shows the sidebars inline; phones
 * only render them in side drawers opened from the mobile header (left: feed filters, right:
 * who to follow and hot tags). Pass `close: false` when the action navigates away.
 */
export const inSidebar = (side: DrawerSide, action: () => void, { close = true }: { close?: boolean } = {}) => {
  if (!isMobile()) {
    action();
    return;
  }
  cy.get(`[data-cy="mobile-header-${side}-btn"]`).filter(':visible').should('have.length', 1).click();
  cy.get(`[data-cy="side-drawer-${side}"]`).should('be.visible').within(action);
  if (close) closeSideDrawer(side);
};
