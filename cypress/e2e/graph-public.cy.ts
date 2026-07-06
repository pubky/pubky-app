// Public deep-link exploration: /graph is an explore route, so a signed-out
// visitor can inspect any user's neighborhood via ?user=<pubky>.
describe('graph explorer (public deep link)', () => {
  it('loads a neighborhood from nexus and renders the canvas', () => {
    // Any pubky known to the connected Nexus; overridable per environment
    const pubky = Cypress.env('GRAPH_PUBKY') ?? 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';

    cy.intercept('GET', '**/v0/graph/user/**').as('neighborhood');
    cy.visit(`/graph?user=${pubky}`);

    cy.get('[data-cy="graph-page"]').should('exist');
    cy.wait('@neighborhood', { timeout: 30000 }).its('response.statusCode').should('eq', 200);

    // The canvas mounts once data is in
    cy.get('[data-cy="social-graph"] canvas', { timeout: 30000 }).should('exist');
    cy.get('[data-cy="graph-legend"]').should('be.visible');
    cy.get('[data-cy="graph-controls"]').should('be.visible');
  });
});
