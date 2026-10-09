import { waitForFeedToLoad } from './posts';

export const openCreateFeedDialog = () => {
  cy.get('[data-cy="feed-navigation"]').find('[aria-label="Create feed"]').should('be.visible').click();
  cy.get('[data-testid="custom-feed-dialog-content"]').should('be.visible').and('contain.text', 'Create Feed');
};

export const openEditFeedDialog = (feedName: string) => {
  // The pencil is pointer-events-none until the tab is hovered on a desktop with hover.
  cy.get('[data-cy="feed-navigation"]').find(`[aria-label="Edit ${feedName}"]`).click({ force: true });
  cy.get('[data-testid="custom-feed-dialog-content"]').should('be.visible').and('contain.text', 'Edit Feed');
};

export const chooseCustomFeedOption = (sectionTestId: string, label: string) => {
  cy.get('[data-testid="custom-feed-dialog-content"]')
    .find(`[data-testid="${sectionTestId}"]`)
    .find('button')
    .first()
    .click();
  cy.get('[role="listbox"]')
    .filter(':visible')
    .find('[role="option"]')
    .filter((_, el) => (el.textContent ?? '').trim() === label)
    .first()
    .click();
};

export const addCustomFeedTag = (tag: string) => {
  const label = tag.toLowerCase();
  cy.get('[data-testid="custom-feed-dialog-content"]')
    .find('[data-testid="feed-tag-input"]')
    .find('[data-cy="add-tag-input"]')
    .type(`${label}{enter}`);
  cy.get('[data-testid="custom-feed-dialog-content"]')
    .find(`[data-cy="post-tag"][data-tag-label="${label}"]`)
    .should('be.visible');
};

export const removeCustomFeedTag = (tag: string) => {
  const label = tag.toLowerCase();
  cy.get('[data-testid="custom-feed-dialog-content"]')
    .find(`[data-cy="post-tag"][data-tag-label="${label}"]`)
    .find('[data-cy="post-tag-remove-btn"]')
    .click();
  cy.get('[data-testid="custom-feed-dialog-content"]')
    .find(`[data-cy="post-tag"][data-tag-label="${label}"]`)
    .should('not.exist');
};

export const saveCustomFeed = () => {
  cy.get('[data-testid="save-feed-button"]').should('not.be.disabled').click();
  cy.get('[data-testid="custom-feed-dialog-content"]').should('not.exist');
  cy.location('pathname').should('match', /^\/feed\/.+/);
  waitForFeedToLoad();
};

export const expectFeedTab = (feedName: string) => {
  cy.get('[data-cy="feed-navigation"]').find(`a[aria-label="${feedName}"]`).should('be.visible');
};

export const goToHomeFeedTab = () => {
  cy.get('[data-cy="feed-navigation"]').find('a[href="/home"]').click();
  cy.location('pathname').should('eq', '/home');
  waitForFeedToLoad();
};

export const expectVisibleReachSelected = (dataCy: string) => {
  cy.get(`[data-cy="${dataCy}"]`).filter(':visible').should('have.attr', 'data-selected', 'true');
};

export const expectVisibleSortSelected = (dataCy: string) => {
  cy.get(`[data-cy="${dataCy}"]`).filter(':visible').should('have.attr', 'data-selected', 'true');
};

export const expectVisibleContentSelected = (label: string) => {
  cy.get('[data-testid="filter-content-radiogroup"]')
    .filter(':visible')
    .find(`[aria-label="${label}"]`)
    .should('have.attr', 'data-selected', 'true');
};

export const expectTimelineContains = (text: string) => {
  cy.contains('[data-cy="timeline-container"] [data-cy="post-card"]', text, { timeout: 30_000 }).should('be.visible');
};

export const expectTimelineOmits = (text: string) => {
  cy.get('[data-cy="timeline-container"]', { timeout: 20_000 }).should('not.contain.text', text);
};

export const expectTimelineEmpty = () => {
  cy.get('[data-cy="timeline-container"]', { timeout: 20_000 }).should('contain.text', 'No posts found');
};

// Engagement ordering is computed by Nexus and can lag the tag write. Reload until it settles.
export const waitForPostOrder = (first: string, second: string, attempts = 8) => {
  const check = (remaining: number) => {
    waitForFeedToLoad();
    cy.get('[data-cy="timeline-posts"]').then(($timeline) => {
      const cards = $timeline
        .find('[data-cy="post-card"]')
        .toArray()
        .map((el) => el.textContent ?? '');
      const firstIndex = cards.findIndex((cardText) => cardText.includes(first));
      const secondIndex = cards.findIndex((cardText) => cardText.includes(second));
      if (firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex) {
        return;
      }
      if (remaining <= 0) {
        expect(firstIndex, `"${first}" index`).to.be.greaterThan(-1);
        expect(secondIndex, `"${second}" index`).to.be.greaterThan(-1);
        expect(firstIndex).to.be.lessThan(secondIndex);
        return;
      }
      cy.wait(3_000);
      cy.reload();
      check(remaining - 1);
    });
  };

  check(attempts);
};
