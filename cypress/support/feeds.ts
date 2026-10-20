import { waitForFeedToLoad } from './posts';

export const openCreateFeedDialog = () => {
  cy.get('[data-cy="feed-navigation"]').find('[data-cy="feed-navigation-create-btn"]').should('be.visible').click();
  cy.get('[data-cy="custom-feed-dialog"]').should('be.visible').and('contain.text', 'Create Feed');
};

export const openEditFeedDialog = (feedName: string) => {
  // The pencil is pointer-events-none until the tab is hovered on a desktop with hover.
  cy.get('[data-cy="feed-navigation"]')
    .find(`[data-cy="feed-navigation-edit-btn"][aria-label="Edit ${feedName}"]`)
    .click({ force: true });
  cy.get('[data-cy="custom-feed-dialog"]').should('be.visible').and('contain.text', 'Edit Feed');
};

// The selects are item-aligned: the open list puts the current option over the trigger, and
// Radix ignores a pointerup within 10px of the press that opened it. A click on the current
// option is swallowed and the list stays open, so pick the option with the keyboard instead.
export const chooseCustomFeedOption = (select: 'reach' | 'sort' | 'content', label: string) => {
  const trigger = () => cy.get('[data-cy="custom-feed-dialog"]').find(`[data-cy="custom-feed-${select}-select"]`);

  trigger().click();
  cy.get('[data-cy="custom-feed-select-options"]')
    .should('be.visible')
    .find('[data-cy="custom-feed-select-option"]')
    .filter((_, el) => (el.textContent ?? '').trim() === label)
    .should('have.length', 1)
    .focus()
    .type('{enter}');
  cy.get('[data-cy="custom-feed-select-options"]').should('not.exist');
  trigger().should(($trigger) => {
    expect($trigger.text().trim()).to.eq(label);
  });
};

export const addCustomFeedTag = (tag: string) => {
  const label = tag.toLowerCase();
  cy.get('[data-cy="custom-feed-dialog"]').find('[data-cy="add-tag-input"]').type(`${label}{enter}`);
  cy.get('[data-cy="custom-feed-dialog"]').find(`[data-cy="post-tag"][data-tag-label="${label}"]`).should('be.visible');
};

export const removeCustomFeedTag = (tag: string) => {
  const label = tag.toLowerCase();
  cy.get('[data-cy="custom-feed-dialog"]')
    .find(`[data-cy="post-tag"][data-tag-label="${label}"]`)
    .find('[data-cy="post-tag-remove-btn"]')
    .click();
  cy.get('[data-cy="custom-feed-dialog"]').find(`[data-cy="post-tag"][data-tag-label="${label}"]`).should('not.exist');
};

export const saveCustomFeed = () => {
  cy.get('[data-cy="custom-feed-save-btn"]').should('not.be.disabled').click();
  cy.get('[data-cy="custom-feed-dialog"]').should('not.exist');
  cy.location('pathname').should('match', /^\/feed\/.+/);
  waitForFeedToLoad();
};

export const expectFeedTab = (feedName: string) => {
  cy.get('[data-cy="feed-navigation"]')
    .find(`[data-cy="feed-navigation-custom-tab"][aria-label="${feedName}"]`)
    .should('be.visible');
};

// The home filters persist, and the test before this one leaves Following + Popularity on.
// Own posts are hidden on Following, so reset before creating posts the test has to see.
export const resetHomeFeedToAllRecent = () => {
  cy.get('[data-cy="filter-reach-radiogroup"]').find('[data-cy="all-reach-toggle"]').click();
  waitForFeedToLoad();
  cy.get('[data-cy="filter-sort-radiogroup"]').find('[data-cy="recent-sort-toggle"]').click();
  waitForFeedToLoad();
};

export const goToHomeFeedTab = () => {
  cy.get('[data-cy="feed-navigation"]').find('[data-cy="feed-navigation-home-tab"]').click();
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
  cy.get('[data-cy="filter-content-radiogroup"]')
    .filter(':visible')
    .find(`[data-cy="${label.toLowerCase()}-content-toggle"]`)
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
