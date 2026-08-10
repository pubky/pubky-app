import { goToCollectionsPage } from './header';
import { fastTagPost, waitForFeedToLoad } from './posts';
import { CheckForNewPosts, WaitForNewPosts } from './types/enums';

// error copy rendered by the add-content dialog (see useAddContentForm)
export const ADD_CONTENT_URL_INVALID_ERROR = 'Enter a valid post URL.';
export const ADD_CONTENT_URL_DUPLICATE_ERROR = 'This post is already added.';

// open a collection from the My Collections section by its name
export const openCollectionFromMyCollections = (collectionName: string) => {
  goToCollectionsPage();
  cy.contains('[data-cy="my-collections-section"] [data-cy="collection-card"]', collectionName)
    .should('be.visible')
    .click();
  cy.location('pathname').should('match', /^\/collections\/[^/]+\/[^/]+$/);
  cy.get('[data-cy="collection-hero"]').should('contain.text', collectionName);
};

// create a collection from the My Collections dashed CTA card on /collections.
// `expectIntro: true` hard-asserts the first-run welcome dialog; `false` hard-asserts
// it is skipped; omit to dismiss the intro if present (order-independent shared helper).
export const createCollection = (
  name: string,
  description?: string,
  { expectIntro, layout = 'grid' }: { expectIntro?: boolean; layout?: 'grid' | 'list' } = {},
) => {
  cy.get('[data-cy="new-collection-card-cta"]').click();

  if (expectIntro === true) {
    cy.get('[data-cy="dialog-content"]').should('contain.text', 'Welcome to Collections');
    cy.get('[data-cy="collections-intro-continue"]').should('be.visible').click();
  } else if (expectIntro === false) {
    cy.get('[data-cy="collections-intro-continue"]').should('not.exist');
    cy.get('[data-cy="collection-form-name-input"]').should('be.visible');
  } else {
    // either the first-time intro or the create form opens; advance past the intro if shown
    cy.get('[data-cy="collections-intro-continue"], [data-cy="collection-form-name-input"]').should('be.visible');
    cy.get('body').then(($body) => {
      if ($body.find('[data-cy="collections-intro-continue"]').length > 0) {
        cy.get('[data-cy="collections-intro-continue"]').click();
      }
    });
  }

  cy.get('[data-cy="collection-form-name-input"]').should('be.visible').clear().type(name);
  if (description) {
    cy.get('[data-cy="collection-form-description-input"]').clear().type(description);
  }
  cy.get(`[data-cy="collection-layout-${layout}"]`).click();

  cy.intercept('PUT', '**/pub/pubky.app/posts/**').as('collectionCreated');
  cy.get('[data-cy="collection-form-save-btn"]').should('not.be.disabled').click();
  cy.wait('@collectionCreated').its('response.statusCode').should('eq', 201);

  // saving navigates to the new collection page
  cy.location('pathname', { timeout: 30_000 }).should('match', /^\/collections\/[^/]+\/[^/]+$/);
  cy.get('[data-cy="collection-hero"]').should('contain.text', name);
};

// switch the current collection's temporary viewer layout; this does not persist
export const selectCollectionViewerLayout = (layout: 'grid' | 'list') => {
  cy.get('[data-cy="collection-layout-menu"]').click();
  cy.get(`[data-cy="collection-layout-${layout}"]`).should('be.visible').click();
};

// edit the collection name and description from the hero's edit button
export const editCollectionFromHero = (newName: string, newDescription: string) => {
  cy.get('[data-cy="collection-hero-edit-btn"]').click();

  cy.get('[data-cy="collection-form-name-input"]').should('be.visible').clear().type(newName);
  cy.get('[data-cy="collection-form-description-input"]').clear().type(newDescription);

  cy.intercept('PUT', '**/pub/pubky.app/posts/**').as('collectionUpdated');
  cy.get('[data-cy="collection-form-save-btn"]').click();
  cy.wait('@collectionUpdated').its('response.statusCode').should('be.oneOf', [200, 201, 204]);

  cy.get('[data-cy="collection-hero"]').should('contain.text', newName);
  cy.get('[data-cy="collection-hero"]').should('contain.text', newDescription);
};

// add tags to the collection via the hero's tag row (same add-tag flow as posts)
export const addTagsToCollectionHero = (tags: string[]) => {
  cy.get('[data-cy="collection-hero"]').within(() => {
    fastTagPost(tags);
    tags.forEach((tag) => {
      cy.contains('button', tag).should('be.visible');
    });
  });
};

// assert the hero post counter shows the expected count
export const collectionCounterEq = (count: number) => {
  cy.get('[data-cy="collection-hero"]')
    .find('[data-cy="collection-count-badge"]')
    .should('contain.text', `${count} ${count === 1 ? 'post' : 'posts'}`);
};

// toggle a post in/out of a collection using the post's save picker
// finds the post by content in the current feed/grid; works from the home feed and the collection grid
export const togglePostInCollectionViaSavePicker = (postContent: string, collectionName: string) => {
  cy.findFirstPostInFeedFiltered(postContent, CheckForNewPosts.No, WaitForNewPosts.Yes).within(() => {
    cy.get('[data-cy="post-bookmark-btn"]').click();
  });

  // adding/removing a collection item rewrites the collection post on the homeserver
  cy.intercept('PUT', '**/pub/pubky.app/posts/**').as('collectionItemToggled');
  cy.contains('[data-cy="post-save-collection-option"]', collectionName).should('be.visible').click();
  cy.wait('@collectionItemToggled').its('response.statusCode').should('be.oneOf', [200, 201, 204]);

  // click away to dismiss the save picker
  cy.get('body').click({ force: true });
  cy.get('[data-cy="post-save-collection-option"]').should('not.exist');
};

// create a new collection containing the post directly from the save picker's inline input
export const createCollectionFromSavePicker = (postContent: string, collectionName: string) => {
  cy.findFirstPostInFeedFiltered(postContent, CheckForNewPosts.No, WaitForNewPosts.Yes).within(() => {
    cy.get('[data-cy="post-bookmark-btn"]').click();
  });

  cy.get('[data-cy="post-save-new-collection-input"]').should('be.visible').type(collectionName);
  cy.intercept('PUT', '**/pub/pubky.app/posts/**').as('collectionCreatedFromPicker');
  cy.get('[data-cy="post-save-new-collection-create-btn"]').click();
  cy.wait('@collectionCreatedFromPicker').its('response.statusCode').should('eq', 201);

  // the new collection appears in the picker list marked as saved
  cy.contains('[data-cy="post-save-collection-option"]', collectionName).should('be.visible');

  // click away to dismiss the save picker
  cy.get('body').click({ force: true });
  cy.get('[data-cy="post-save-collection-option"]').should('not.exist');
};

// add a post to the current collection by pasting its URL in the Add Post dialog
export const addPostToCollectionByUrl = (postUrl: string) => {
  cy.get('[data-cy="collection-add-content"]').click();
  cy.get('[data-cy="add-content-url-input"]').should('be.visible');

  cy.intercept('PUT', '**/pub/pubky.app/posts/**').as('postAddedByUrl');
  cy.get('[data-cy="add-content-url-input"]').type(`${postUrl}{enter}`);
  cy.wait('@postAddedByUrl').its('response.statusCode').should('be.oneOf', [200, 201, 204]);

  // the dialog closes on success
  cy.get('[data-cy="dialog-content"]').should('not.exist');
};

// attempt to add a URL in the Add Post dialog and expect a validation error; closes the dialog
export const addPostToCollectionByUrlExpectingError = (postUrl: string, errorMessage: string) => {
  cy.get('[data-cy="collection-add-content"]').click();
  cy.get('[data-cy="add-content-url-input"]').should('be.visible').type(`${postUrl}{enter}`);

  cy.get('[data-cy="dialog-content"]').should('contain.text', errorMessage);
  cy.get('[data-cy="add-content-url-input"]').should('have.attr', 'aria-invalid', 'true');

  cy.get('[data-testid="dialog-close"]').click();
  cy.get('[data-cy="dialog-content"]').should('not.exist');
};

// create a brand new post from the Add Post dialog; it is saved into the current collection
export const createPostInCollection = (postContent: string) => {
  cy.get('[data-cy="collection-add-content"]').click();
  cy.get('[data-cy="add-content-create-post"]').should('be.visible').click();

  cy.get('[data-cy="new-post-input"]')
    .should('be.visible')
    .within(() => {
      cy.get('textarea').should('have.value', '').type(postContent);
      cy.intercept('PUT', '**/pub/pubky.app/posts/**').as('postCreatedInCollection');
      cy.get('[data-cy="post-input-action-bar-post"]').click();
      // first PUT creates the post itself
      cy.wait('@postCreatedInCollection').its('response.statusCode').should('eq', 201);
    });

  // second PUT rewrites the collection post with the new item
  cy.wait('@postCreatedInCollection').its('response.statusCode').should('be.oneOf', [200, 201, 204]);
  cy.get('[data-cy="dialog-content"]').should('not.exist');
};

// delete the current collection from its hero; lands back on /collections
export const deleteCollectionFromHero = () => {
  cy.get('[data-cy="collection-hero-delete-btn"]').click();
  cy.get('[data-cy="dialog-content"]')
    .should('be.visible')
    .within(() => {
      cy.get('[data-cy="dialog-confirm-delete-btn"]').click();
    });
  cy.location('pathname').should('eq', '/collections');
};

// apply a content filter (e.g. 'All', 'Collections') from the home feed sidebar
export const applyContentFilter = (label: string) => {
  cy.get('[data-testid="filter-content-radiogroup"]').find(`[aria-label="${label}"]`).click();
  waitForFeedToLoad();
};

// find the collection card containing the given name within a landing section
export const findCollectionCardInSection = (sectionSelector: string, collectionName: string) => {
  return cy.get(sectionSelector).contains('[data-cy="collection-card"]', collectionName);
};

// assert a landing section does not list a collection with the given name.
// FollowedCollections returns null when empty, so a missing section also counts as success.
export const sectionDoesNotContainCollection = (sectionSelector: string, collectionName: string) => {
  cy.get('body').should(($body) => {
    const $section = $body.find(sectionSelector);
    if ($section.length === 0) {
      return;
    }
    expect($section.text()).to.not.include(collectionName);
  });
};
