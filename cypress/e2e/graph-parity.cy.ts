/**
 * Visual-parity captures against the Figma design frames (1280x720).
 * Not an assertion suite: the screenshots land in cypress/screenshots for a
 * side-by-side review next to the design renders.
 */

const PUBKY = Cypress.env('GRAPH_PUBKY') ?? 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';

describe('graph visual parity captures', () => {
  it('captures the default explorer view at the design frame size', () => {
    cy.viewport(1280, 720);
    cy.intercept('GET', '**/v0/graph/user/**').as('neighborhood');
    cy.visit(`/graph?user=${PUBKY}`);
    cy.wait('@neighborhood', { timeout: 30000 });
    cy.get('[data-cy="social-graph"] canvas', { timeout: 30000 }).should('exist');
    // Let the data land, the simulation settle, and avatars/chips rasterize.
    // settled() is briefly true on the empty pre-data engine, so gate on
    // nodes being present too.
    cy.window({ timeout: 60000 }).should((win) => {
      const dbg = win.__graphDebug;
      expect(dbg?.nodeIds().user.length ?? 0, 'users on canvas').to.be.greaterThan(0);
      expect(dbg?.settled(), 'simulation settled').to.eq(true);
    });
    cy.wait(2000);
    // cy.screenshot captures GPU-composited canvases as black in headless
    // Chrome; dump the bitmap straight from the canvas instead
    cy.window().then((win) => {
      const canvas = win.document.querySelector('[data-cy="social-graph"] canvas') as HTMLCanvasElement;
      cy.writeFile('screenshots/parity-canvas-1280.png.b64', canvas.toDataURL('image/png').split(',')[1]);
    });
    cy.screenshot('parity-default-1280', { capture: 'viewport', overwrite: true });
  });

  it('captures the mobile layout', () => {
    cy.viewport(390, 844);
    cy.intercept('GET', '**/v0/graph/user/**').as('neighborhood');
    cy.visit(`/graph?user=${PUBKY}`);
    cy.wait('@neighborhood', { timeout: 30000 });
    cy.get('[data-cy="social-graph"] canvas', { timeout: 30000 }).should('exist');
    cy.wait(3000);
    cy.screenshot('parity-mobile-390', { capture: 'viewport', overwrite: true });
  });
});

export {};
