import { editProfileAndVerify, addLinks, addProfileTags } from '../support/profile';
import { slowCypressDown } from 'cypress-slow-down';
import { BackupType, HasBackedUp } from '../support/types/enums';
import { backupDownloadFilePath } from '../support/auth';
import { searchForProfileByName } from '../support/contacts';
import { goToProfilePageFromHeader } from '../support/header';

describe('profile', () => {
  before(() => {
    slowCypressDown();
    cy.deleteDownloadsFolder();
  });

  const profileName = 'Edit Me';

  beforeEach(() => {
    cy.onboardAsNewUser(profileName, 'This bio is editable', [BackupType.EncryptedFile]);
  });

  it('editing should retain any changes made to own profile', () => {
    // todo: add test profile picture upload

    // navigate to edit profile page
    goToProfilePageFromHeader();
    cy.get('[data-cy="profile-edit-btn"]').click();
    cy.location('pathname').should('eq', '/settings/edit');

    // edit username and bio and verify changes are persisted
    editProfileAndVerify({ name: 'Edited Name', bio: 'This bio has been edited.' });

    // re-open edit page and add two new links to the profile
    cy.get('[data-cy="profile-edit-btn"]').click();
    cy.location('pathname').should('eq', '/settings/edit');
    addLinks([
      { label: 'Bluesky', url: 'https://bsky.app/profile/bsky.app' },
      { label: 'Github', url: 'https://github.com/synonymdev/bitkit' },
    ]);

    // check the new links are shown with correct values
    cy.get('[data-cy="edit-profile-link-bluesky-input"]')
      .should('be.visible')
      .and('have.value', 'https://bsky.app/profile/bsky.app');
    cy.get('[data-cy="edit-profile-link-github-input"]')
      .should('be.visible')
      .and('have.value', 'https://github.com/synonymdev/bitkit');

    // check the 'website' and 'x (twitter)' default links are still shown
    cy.get('[data-cy="edit-profile-link-website-input"]').should('be.visible');
    cy.get('[data-cy="edit-profile-link-x (twitter)-input"]').should('be.visible');

    // edit bio again, edit the Bluesky link and verify changes are persisted
    editProfileAndVerify({ bio: 'This bio has been edited again!', linkBluesky: 'https://bsky.app/profile/pubky.app' });

    // re-open edit page and check that default link types are not shown, only the new ones
    cy.get('[data-cy="profile-edit-btn"]').click();
    cy.location('pathname').should('eq', '/settings/edit');
    cy.get('[data-cy="edit-profile-link-website-input"]').should('not.exist');
    cy.get('[data-cy="edit-profile-link-x (twitter)-input"]').should('not.exist');
    cy.get('[data-cy="edit-profile-link-bluesky-input"]').should('be.visible');
    cy.get('[data-cy="edit-profile-link-github-input"]').should('be.visible');
  });

  it('cancelling edit should not retain any changes made to own profile', () => {
    // navigate to edit profile page
    goToProfilePageFromHeader();
    cy.get('[data-cy="profile-edit-btn"]').click();
    cy.location('pathname').should('eq', '/settings/edit');

    // change name and bio
    cy.get('#profile-name-input').clear();
    cy.get('#profile-name-input').type('Name Not Changed');
    cy.get('#profile-bio-input').clear();
    cy.get('#profile-bio-input').type('Bio Not Changed');

    // cancel the changes
    cy.get('[data-cy="edit-profile-cancel-btn"]').click();

    // verify redirection to the profile page
    cy.location('pathname').should('eq', '/profile');

    // reload the page to ensure changes are not persisted
    cy.waitReload(500);
    cy.get('[data-cy="profile-username-header"]').invoke('text').should('eq', profileName);
    // This approach is necessary for bio due to additional space inserted before final word.
    cy.get('[data-cy="profile-bio-header"]').should(($elem) => {
      expect($elem.get(0).innerText).to.eq('This bio is editable');
    });
  });

  it('can tag own profile', () => {
    // navigate to own profile page
    goToProfilePageFromHeader();

    // assert no tags yet in sidebar
    cy.get('[data-cy="profile-tagged-section"]').contains('No tags added yet.');

    // navigate to the tagged tab and add tags to own profile
    cy.get('[data-cy="profile-filter-item-tagged"]').click();
    addProfileTags(['me-1', 'me-2']);

    // verify tags are displayed on 'Tagged' tab content
    cy.get('[data-cy="profile-tab-content"]').contains('me-1');
    cy.get('[data-cy="profile-tab-content"]').contains('me-2');

    // verify tags are displayed in sidebar tagged section (Notifications tab)
    cy.get('[data-cy="profile-filter-item-notifications"]').click();
    cy.get('[data-cy="profile-tagged-section"]').contains('me-1');
    cy.get('[data-cy="profile-tagged-section"]').contains('me-2');
  });

  it('can tag other profile', () => {
    // sign up a user to tag and sign back in as the primary user
    // random username required to avoid conflicts with existing profiles when searching by name
    const profileToTagPubkyName = `${Cypress._.random(100_000)}-Tag Me`;
    cy.signOut(HasBackedUp.Yes);
    cy.onboardAsNewUser(profileToTagPubkyName, 'This profile is destined to be tagged');
    cy.signOut(HasBackedUp.No);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profileName));

    // navigate to the profile to tag
    searchForProfileByName(profileToTagPubkyName);

    // add tags to other profile
    cy.get('[data-cy="profile-filter-item-tagged"]').click();
    addProfileTags(['them-1', 'them-2']);

    // verify tags are displayed on 'Tagged' tab content
    cy.get('[data-cy="profile-tab-content"]').contains('them-1');
    cy.get('[data-cy="profile-tab-content"]').contains('them-2');

    // verify tags are displayed in sidebar tagged section (Posts tab)
    cy.get('[data-cy="profile-filter-item-posts"]').click();
    cy.get('[data-cy="profile-tagged-section"]').contains('them-1');
    cy.get('[data-cy="profile-tagged-section"]').contains('them-2');
  });

  // todo: enable once decided on correct behaviour for searching using pubky of non-existent user
  it.skip('should not add non-existent user to recent history when visiting their profile', () => {
    // search for a non-existent user
    const nonExistentUser = 'pk:gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';
    cy.get('[data-cy="header-search-input"]').type(nonExistentUser).type('{enter}');

    // verify page is empty
    cy.get('[data-cy="profile-username-header"]').should('not.exist');
    cy.get('[data-cy="profile-bio-header"]').should('not.exist');

    cy.location('pathname').should('eq', '/search');

    // go back to home page
    cy.visit('/');

    // open search bar to check history
    cy.get('[data-cy="header-search-input"]').filter(':visible').click();

    // verify user was not added to recent history
    // history is stored in localStorage
    cy.window().then((win) => {
      const searchHistory = JSON.parse(win.localStorage.getItem('searchHistory') || '[]');
      expect(searchHistory).to.not.contain(nonExistentUser);
    });

    // verify user was not added to recent history UI
    cy.get('[data-cy="search-user-suggestion-0"]').should('not.exist');
  });
});
