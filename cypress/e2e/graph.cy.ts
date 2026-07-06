import { slowCypressDown } from 'cypress-slow-down';
import { BackupType } from '../support/types/enums';

describe('graph explorer', () => {
  before(() => {
    slowCypressDown();
    cy.deleteDownloadsFolder();
  });

  it('renders the graph page shell with legend and controls', () => {
    cy.onboardAsNewUser('Graph Explorer', 'I map the social universe', [BackupType.RecoveryPhraseWithoutConfirmation]);

    cy.visit('/graph');
    cy.get('[data-cy="graph-page"]').should('exist');
    cy.get('[data-cy="graph-legend"]').should('be.visible');
    cy.get('[data-cy="graph-controls"]').should('be.visible');

    // A fresh account has no follows: the empty state invites growing the graph
    cy.contains('Nothing to explore yet', { timeout: 20000 }).should('be.visible');

    // Legend rows double as class toggles
    cy.get('[data-cy="graph-legend-post"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-cy="graph-legend-post"]').click();
    cy.get('[data-cy="graph-legend-post"]').should('have.attr', 'aria-pressed', 'false');
  });
});
