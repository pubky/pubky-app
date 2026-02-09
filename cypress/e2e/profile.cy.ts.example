import { editProfileAndVerify, addLinks, addProfileTags } from '../support/profile';
import { slowCypressDown } from 'cypress-slow-down';
import { HasBackedUp, SkipOnboardingSlides } from '../support/types/enums';
import { backupDownloadFilePath } from '../support/auth';
import { searchForProfileByName, searchForProfileByPubky } from '../support/contacts';

describe('profile', () => {
  before(() => {
    slowCypressDown();
  });

  const profile1 = 'edit-me';

  beforeEach(() => {
    cy.onboardAsNewUser('Edit Me', 'This bio is editable', SkipOnboardingSlides.Yes, profile1);
    cy.backupRecoveryFile();
    cy.renameFile(backupDownloadFilePath(), backupDownloadFilePath(profile1));
  });

  it('editing should retain any changes made to own profile', () => {
    // todo: add test profile picture upload

    // navigate to edit profile page
    cy.get('#header-profile-pic').click();
    cy.get('#profile-edit-btn').click();

    // edit username and bio and verify changes are persisted
    editProfileAndVerify({ name: 'Edited Name', bio: 'This bio has been edited.' });

    // re-open edit page and add two new links to the profile
    cy.get('#profile-edit-btn').click();
    addLinks([
      { label: 'Bluesky', url: 'https://bsky.app/profile/bsky.app' },
      { label: 'Github', url: 'https://github.com/synonymdev/bitkit' }
    ]);

    // check the new links are shown with correct values
    cy.get('#edit-profile-link-bluesky-input')
      .should('be.visible')
      .and('have.value', 'https://bsky.app/profile/bsky.app');
    cy.get('#edit-profile-link-github-input').should('be.visible').and('have.value', 'synonymdev/bitkit');

    // check the 'website' and 'x(Twitter)' example links are still shown
    cy.get('#edit-profile-link-website-input').should('be.visible');
    cy.get('#edit-profile-link-x\\ \\(twitter\\)-input').should('be.visible');

    // edit bio again, edit the Bluesky link and verify changes are persisted
    editProfileAndVerify({ bio: 'This bio has been edited again!', linkBluesky: 'https://bsky.app/profile/pubky.app' });

    // re-open edit page and check that default link types are not shown, only the new ones
    cy.get('#profile-edit-btn').click();
    cy.get('#edit-profile-link-website-input').should('not.exist');
    cy.get('#edit-profile-link-x\\ \\(twitter\\)-input').should('not.exist');
    cy.get('#edit-profile-link-bluesky-input').should('be.visible');
    cy.get('#edit-profile-link-github-input').should('be.visible');
  });

  it('cancelling edit should not retain any changes made to own profile', () => {
    // navigate to edit profile page
    cy.get('#header-profile-pic').click();
    cy.get('#profile-edit-btn').click();

    // change name and bio
    cy.get('#edit-profile-name-input').clear();
    cy.get('#edit-profile-name-input').type('Name Not Changed');
    cy.get('#edit-profile-bio-input').clear();
    cy.get('#edit-profile-bio-input').type('Bio Not Changed');

    // Cancel the changes
    cy.get('#edit-profile-cancel-btn').click();

    // Verify redirection to the profile page
    cy.location('pathname').should('eq', '/profile');

    // Reload the page to ensure changes are not persisted
    cy.waitReload(500);
    cy.get('#profile-username-header').invoke('text').should('eq', 'Edit Me');
    // This approach is necessary for bio due to additional space inserted before final word.
    cy.get('#profile-bio-content').should(($elem) => {
      expect($elem.get(0).innerText).to.eq('This bio is editable');
    });
  });

  it('can tag own profile', () => {
    // navigate to own profile page
    cy.get('#header-profile-pic').click();

    // assert 'No tags yet'
    cy.get('#profile-tagged-section').contains('No tags yet');

    // add tags to own profile
    cy.get('#profile-tab-tagged').click();
    addProfileTags(['me-1', 'me-2']);

    // verify tags are displayed on 'Tagged' tab
    cy.get('#profile-tab-content').contains('me-1');
    cy.get('#profile-tab-content').contains('me-2');

    // TODO: remove reload once bug fixed https://github.com/pubky/pubky-app/issues/1410
    cy.reload();

    // verify tags are displayed on main page (Notifications tab)
    cy.get('#profile-tab-notifications').click();
    cy.get('#profile-tagged-section').contains('me-1');
    cy.get('#profile-tagged-section').contains('me-2');

    // TODO: add check for tags persisted after reload once above workaround is removed, once bug is fixed https://github.com/pubky/pubky-app/issues/1410
    // cy.reload();
    // cy.get('#profile-tagged-section').contains('me-1');
    // cy.get('#profile-tagged-section').contains('me-2');
  });

  it('can tag other profile', () => {
    // sign up a user to tag and sign back in as the primary user
    // random username required to avoid conflicts with existing profiles when searching by name
    const profileToTagPubkyName = `${Cypress._.random(100_000)}-Tag Me`;
    cy.signOut(HasBackedUp.Yes);
    cy.onboardAsNewUser(profileToTagPubkyName, 'This profile is destined to be tagged');
    cy.signOut(HasBackedUp.No);
    cy.signIn(backupDownloadFilePath(profile1));

    // navigate to the profile to tag
    searchForProfileByName(profileToTagPubkyName);

    // add taggs to other profile
    cy.get('#profile-tab-tagged').click();
    addProfileTags(['them-1', 'them-2']);

    // verify tags are displayed on 'Tagged' tab
    cy.get('#profile-tab-content').contains('them-1');
    cy.get('#profile-tab-content').contains('them-2');

    // TODO: remove reload once bug fixed https://github.com/pubky/pubky-app/issues/1410
    cy.reload();

    // verify tags are displayed on main page (Posts tab)
    cy.get('#profile-tab-posts').click();
    cy.get('#profile-tagged-section').contains('them-1');
    cy.get('#profile-tagged-section').contains('them-2');

    // TODO: add check for tags persisted after reload once above workaround is removed, once bug is fixed https://github.com/pubky/pubky-app/issues/1410
    // cy.reload();
    // cy.get('#profile-tagged-section').contains('them-1');
    // cy.get('#profile-tagged-section').contains('them-2');
  });

  it('should not add non-existent user to recent history when visiting their profile', () => {
    // Search for a non-existent user
    const nonExistentUser = 'pk:gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';
    cy.get('#header-search-input').type(nonExistentUser).type('{enter}');

    // Verify page is empty
    cy.get('#profile-username-header').should('not.exist');
    cy.get('#profile-bio-content').should('not.exist');

    // Go back to home page
    cy.visit('/');

    // Open search bar to check history
    cy.get('#header-search-input').click();

    // Verify user was not added to recent history
    // History is stored in localStorage
    cy.window().then((win) => {
      const searchHistory = JSON.parse(win.localStorage.getItem('searchHistory') || '[]');
      expect(searchHistory).to.not.contain(nonExistentUser);
    });

    // Verify user was not added to recent history
    cy.get('#user-0').should('not.exist');
  });
});
