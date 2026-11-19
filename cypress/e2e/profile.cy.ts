import {
  editProfileAndVerify,
  addLinks,
  addProfileTags,
  chooseAvatar,
  getProfileTaggedSection,
  openEditProfile,
  openProfileTab,
  showProfileHeader,
  showProfileTaggedSection,
} from '../support/profile';
import { userIdFromPubky } from '../support/common';
import { avatarRoute, avatarServed, expectImageServed, imagesFrom } from '../support/media';
import { slowCypressDown } from 'cypress-slow-down';
import { HasBackedUp } from '../support/types/enums';
import { searchForProfileByName, searchForProfileByPubky } from '../support/contacts';
import { goToProfilePageFromHeader } from '../support/header';
import { itMobile } from '../support/mobile';
import { userIndexed, userTagsIndexed, waitForNexus } from '../support/nexus';
import { seedUserViaApi } from '../support/seed';

describe('profile', () => {
  before(() => {
    slowCypressDown();
  });

  const profileName = 'Edit Me';

  beforeEach(() => {
    cy.onboardAsNewUser(profileName, 'This bio is editable');
  });

  itMobile('editing should retain any changes made to own profile', () => {
    // navigate to edit profile page
    goToProfilePageFromHeader();
    showProfileHeader();
    cy.get('[data-cy="profile-copy-pubkey-btn"]').filter(':visible').should('have.length', 1).click();
    cy.saveCopiedPubkyToAlias('ownPubky');
    openEditProfile();

    // choose an avatar, edit username and bio, and verify changes are persisted
    chooseAvatar();
    cy.intercept('PUT', '**/pub/social/v1/files/*').as('avatarStored');
    editProfileAndVerify({ name: 'Edited Name', bio: 'This bio has been edited.' });
    cy.wait('@avatarStored').its('response.statusCode').should('eq', 201);

    // The avatar is a v1 file, which Nexus serves on the avatar route once it has indexed the profile naming it
    cy.get('@ownPubky').then((pubky) => {
      const userId = userIdFromPubky(String(pubky));
      const route = avatarRoute(userId);
      waitForNexus(avatarServed(userId));
      cy.reload();
      // The header's own avatar and the page's are the same image
      expectImageServed(() => cy.get('img').filter(imagesFrom(route)).first(), route);
    });

    // re-open edit page and add two new links to the profile
    openEditProfile();
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
    openEditProfile();
    cy.get('[data-cy="edit-profile-link-website-input"]').should('not.exist');
    cy.get('[data-cy="edit-profile-link-x (twitter)-input"]').should('not.exist');
    cy.get('[data-cy="edit-profile-link-bluesky-input"]').should('be.visible');
    cy.get('[data-cy="edit-profile-link-github-input"]').should('be.visible');
  });

  itMobile('cancelling edit should not retain any changes made to own profile', () => {
    // navigate to edit profile page
    goToProfilePageFromHeader();
    openEditProfile();

    // change name and bio
    cy.get('#profile-name-input').clear();
    cy.get('#profile-name-input').type('Name Not Changed');
    cy.get('#profile-bio-input').clear();
    cy.get('#profile-bio-input').type('Bio Not Changed');

    // cancel the changes
    cy.get('[data-cy="edit-profile-cancel-btn"]').click();

    // verify redirection to the profile page the edit was opened from
    cy.get<string>('@editProfileOrigin').then((origin) => {
      cy.location('pathname').should('eq', origin);
    });

    // reload the page to ensure changes are not persisted
    cy.waitReload(500);
    showProfileHeader();
    cy.get('[data-cy="profile-username-header"]').filter(':visible').invoke('text').should('eq', profileName);
    // This approach is necessary for bio due to additional space inserted before final word.
    cy.get('[data-cy="profile-bio-header"]')
      .filter(':visible')
      .should(($elem) => {
        expect($elem.get(0).innerText).to.eq('This bio is editable');
      });
  });

  it('can tag own profile', () => {
    // navigate to own profile page
    goToProfilePageFromHeader();

    // assert no tags yet in sidebar
    showProfileHeader();
    getProfileTaggedSection().contains('No tags added yet.');

    // navigate to the tagged tab and add tags to own profile
    openProfileTab('tagged');
    addProfileTags(['me-1', 'me-2']);

    // verify tags are displayed on 'Tagged' tab content
    cy.get('[data-cy="profile-tab-content"]').contains('me-1');
    cy.get('[data-cy="profile-tab-content"]').contains('me-2');

    // verify tags are displayed in sidebar tagged section (Notifications tab)
    showProfileTaggedSection('notifications');
    getProfileTaggedSection().contains('me-1');
    getProfileTaggedSection().contains('me-2');
  });

  it('can tag other profile', () => {
    // sign up a user to tag and sign back in as the primary user
    // random username required to avoid conflicts with existing profiles when searching by name
    const profileToTagPubkyName = `${Cypress._.random(100_000)}-Tag Me`;
    cy.signOut(HasBackedUp.Yes);
    cy.onboardAsNewUser(profileToTagPubkyName, 'This profile is destined to be tagged');
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithPubkyRing(profileName);

    // navigate to the profile to tag
    searchForProfileByName(profileToTagPubkyName);

    // add tags to other profile
    openProfileTab('tagged');
    addProfileTags(['them-1', 'them-2']);

    // verify tags are displayed on 'Tagged' tab content
    cy.get('[data-cy="profile-tab-content"]').contains('them-1');
    cy.get('[data-cy="profile-tab-content"]').contains('them-2');

    // verify tags are displayed in sidebar tagged section (Posts tab)
    showProfileTaggedSection('posts');
    getProfileTaggedSection().contains('them-1');
    getProfileTaggedSection().contains('them-2');
  });

  itMobile('can tag other profile from the tag button on their profile', () => {
    // the profile to tag only needs to exist, so it is seeded through the API
    seedUserViaApi(`${Cypress._.random(100_000)}-Tag My Button`, { bio: 'Tag me from my profile header' }).then(
      (target) => {
        waitForNexus(userIndexed(target));
        searchForProfileByPubky(target.pubky, target.name);

        // the tag button opens their Tagged tab
        showProfileTaggedSection('posts');
        cy.get('[data-cy="profile-tag-btn"]:visible').click();
        cy.location('pathname').should('eq', `/profile/${target.id}/tagged`);
        addProfileTags(['button-1']);

        // verify the tag is displayed on 'Tagged' tab content and in the sidebar tagged section (Posts tab)
        cy.get('[data-cy="profile-tab-content"]').contains('button-1');
        showProfileTaggedSection('posts');
        getProfileTaggedSection().contains('button-1');
        waitForNexus(userTagsIndexed(target, ['button-1']));
      },
    );
  });

  it('rolls back the follow state when homeserver fails to save the follow', () => {
    const profileToFollowName = `${Cypress._.random(100_000)}-Follow Me`;
    cy.signOut(HasBackedUp.Yes);
    cy.onboardAsNewUser(profileToFollowName, 'This profile is never actually followed');
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithPubkyRing(profileName);

    searchForProfileByName(profileToFollowName);

    cy.intercept('PUT', '**/pub/social/v1/follows/**', { statusCode: 507 }).as('followFailed');
    cy.get('[data-cy="profile-follow-toggle-btn"]').filter(':visible').should('have.text', 'Follow').click();
    cy.wait('@followFailed');

    cy.get('[data-cy="toast"]').filter(':visible').should('contain.text', 'Could not follow user. Try again.');
    cy.get('[data-cy="profile-follow-toggle-btn"]').filter(':visible').should('have.text', 'Follow');

    // the rolled back local follow does not come back from Dexie after a reload
    cy.reload();
    cy.get('[data-cy="profile-username-header"]').filter(':visible').should('have.text', profileToFollowName);
    cy.get('[data-cy="profile-follow-toggle-btn"]').filter(':visible').should('have.text', 'Follow');
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
