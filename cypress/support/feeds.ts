import { waitForFeedToLoad } from './posts';

export const openCreateFeedDialog = () => {
  cy.get('[data-cy="feed-navigation"]').find('[data-cy="feed-navigation-create-btn"]').should('be.visible').click();
  cy.get('[data-cy="custom-feed-dialog"]').should('be.visible').and('contain.text', 'Create Feed');
};

export const openEditFeedDialog = (feedName: string) => {
  const pencil = `[data-cy="feed-navigation-edit-btn"][aria-label="Edit ${feedName}"]`;
  // On a desktop with hover the pencil stays transparent and ignores the pointer until its tab is
  // hovered or holds focus, so reveal it with focus as a keyboard user would.
  cy.get('[data-cy="feed-navigation"]').find(pencil).focus();
  cy.get('[data-cy="feed-navigation"]').find(pencil).filter(':visible').should('have.length', 1).click();
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

const postOrderIndexes = ($cards: JQuery<HTMLElement>, first: string, second: string) => {
  const texts = $cards.toArray().map((el) => el.textContent ?? '');
  return {
    firstIndex: texts.findIndex((text) => text.includes(first)),
    secondIndex: texts.findIndex((text) => text.includes(second)),
  };
};

const expectOrderIndexes = (first: string, second: string, firstIndex: number, secondIndex: number) => {
  expect(firstIndex, `"${first}" index`).to.be.greaterThan(-1);
  expect(secondIndex, `"${second}" index`).to.be.greaterThan(-1);
  expect(firstIndex, `"${first}" before "${second}"`).to.be.lessThan(secondIndex);
};

export const expectPostOrder = (first: string, second: string) => {
  cy.get('[data-cy="timeline-posts"]')
    .find('[data-cy="post-card"]')
    .should(($cards) => {
      const { firstIndex, secondIndex } = postOrderIndexes($cards, first, second);
      expectOrderIndexes(first, second, firstIndex, secondIndex);
    });
};

// Popularity order is computed by Nexus and can lag the tag write. Popularity streams are never
// cached, so every reload fetches a fresh page from Nexus: reload until the order settles.
export const waitForPopularityOrder = (first: string, second: string, reloads = 8) => {
  cy.intercept({ method: 'GET', pathname: '/v0/stream/posts/keys', query: { sorting: 'total_engagement' } }).as(
    'popularityStream',
  );
  const check = (remaining: number) => {
    waitForFeedToLoad();
    // Judge the order only once both cards have rendered, so a page still filling in costs no reload.
    cy.get('[data-cy="timeline-posts"]')
      .find('[data-cy="post-card"]')
      .should(($cards) => {
        const { firstIndex, secondIndex } = postOrderIndexes($cards, first, second);
        expect(firstIndex, `"${first}" index`).to.be.greaterThan(-1);
        expect(secondIndex, `"${second}" index`).to.be.greaterThan(-1);
      })
      .then(($cards) => {
        const { firstIndex, secondIndex } = postOrderIndexes($cards, first, second);
        if (firstIndex < secondIndex) return;
        if (remaining <= 0) {
          expectOrderIndexes(first, second, firstIndex, secondIndex);
          return;
        }
        cy.reload();
        cy.wait('@popularityStream');
        check(remaining - 1);
      });
  };

  check(reloads);
};
