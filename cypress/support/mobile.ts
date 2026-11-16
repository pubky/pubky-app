export const isMobile = (): boolean => Boolean(Cypress.expose('isMobile'));

declare global {
  interface Window {
    mobileSubset?: Set<string>;
  }
}

// The support file and each spec are separate bundles that share the spec window, so the subset
// lives on the window rather than in this module.
const mobileSubset = () => (window.mobileSubset ??= new Set<string>());

/**
 * A test in the mobile smoke subset: it runs on desktop and phones, while a plain `it` runs on
 * desktop only, including tests of features phones do not offer (e.g. the layout filter).
 * Mobile VRT covers the phone layout, so the subset is the tests that prove a
 * phone-only interaction (footer, drawers, tab bars, sheets, composer tabs) or behaviour that
 * depends on the viewport (scroll-triggered paging, scroll restore). Specs without one are left
 * out of the mobile matrix in e2e-test.yml.
 */
export const itMobile = (title: string, fn: Mocha.Func) => {
  mobileSubset().add(title);
  return it(title, fn);
};

// Called once from the support file. A skip from a root beforeEach leaves only that test pending.
export const skipTestsOutsideMobileSubset = () => {
  if (!isMobile()) return;
  beforeEach(function () {
    if (!mobileSubset().has(this.currentTest?.title ?? '')) this.skip();
  });
};

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
