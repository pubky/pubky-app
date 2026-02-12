import { goToProfilePageFromHeader } from './header';

interface ProfileField {
  editSelector: string;
  verifySelector: string;
  verifyBy?: 'innerText' | 'href';
}

const profileFields: { [key: string]: ProfileField } = {
  name: {
    editSelector: '#profile-name-input',
    verifySelector: '[data-cy="profile-username-header"]',
  },
  bio: {
    editSelector: '#profile-bio-input',
    verifySelector: '[data-cy="profile-bio-header"]',
  },
  linkBluesky: {
    editSelector: '[data-cy="edit-profile-link-bluesky-input"]',
    verifySelector: '[data-cy="profile-link-bluesky"]',
    verifyBy: 'href',
  },
  linkGithub: {
    editSelector: '[data-cy="edit-profile-link-github-input"]',
    verifySelector: '[data-cy="profile-link-github"]',
    verifyBy: 'href',
  },
};

// use on edit profile page
export const addLinks = (links: { label: string; url: string }[]) => {
  links.forEach((link) => {
    cy.get('[data-cy="edit-profile-add-link-btn"]').click();
    cy.get('[data-cy="dialog-content"]').should('be.visible');
    cy.get('[data-cy="add-profile-link-label-input"]').type(link.label);
    cy.get('[data-cy="add-profile-link-url-input"]').type(link.url);
    cy.get('[data-cy="add-profile-link-submit-btn"]').click();
    cy.get(`[data-cy="edit-profile-link-${link.label.toLowerCase()}-input"]`).should('be.visible');
  });
};

// use on edit profile page
// todo: add support for profile picture upload
export const editProfileAndVerify = (profileData: Partial<Record<keyof typeof profileFields, string>>) => {
  // Perform the edit on each field in profileData
  Object.entries(profileData).forEach(([field, value]) => {
    const { editSelector } = profileFields[field];
    cy.get(editSelector).clear();
    cy.get(editSelector).type(value as string);
  });

  // Save the changes
  cy.get('[data-cy="edit-profile-save-btn"]').click();

  // Verify redirection to the profile page
  cy.location('pathname').should('eq', '/profile');

  // Verify the changes for each field in profileData
  Object.entries(profileData).forEach(([field, value]) => {
    const { verifySelector, verifyBy } = profileFields[field];

    if (verifyBy === 'href') {
      cy.get(verifySelector).should('have.attr', 'href', value);
    } else {
      // This is the equivalent of Selenium's getText() method, which returns the innerText of a visible element.
      // This approach is necessary for bio due to additional space inserted before final word.
      cy.get(verifySelector).should(($elem) => {
        expect($elem.get(0).innerText).to.eq(value);
      });
    }
  });
};

export const clickFollowButton = () => {
  cy.get('[data-cy="profile-follow-toggle-btn"]').should('be.visible').and('have.text', 'Follow').click();
  // Check follow button is now unfollow
  cy.get('[data-cy="profile-follow-toggle-btn"]').should('be.visible').and('have.text', 'Following');
};

export const clickUnfollowButton = () => {
  cy.get('[data-cy="profile-follow-toggle-btn"]').should('be.visible').and('have.text', 'Following').click();
  // Check follow button is now follow
  cy.get('[data-cy="profile-follow-toggle-btn"]').should('be.visible').and('have.text', 'Follow');
};

// wait for notifications to load profile names (prevents 'no longer attached to the DOM' error when checking list of notifications)
export const waitForNotificationsToLoad = (attempts: number = 5) => {
  if (attempts <= 0) assert(false, `waitForNotificationsToLoad: Notifications not loaded`);

  cy.get('[data-cy="notifications-list"]').then(($notificationsList) => {
    cy.wrap($notificationsList)
      .invoke('text')
      .then((text) => {
        // if contains 'pk:' then pubky is being used whilst waiting for profile name
        if (text.includes('No notifications yet') || text.includes('Loading') || text.includes('pk:')) {
          cy.wait(1000);
          waitForNotificationsToLoad(attempts - 1);
        }
      });
  });
};

// wait for notification dot to disappear from all listed notifications
export const waitForNotificationDotsToDisappear = () => {
  cy.get('[data-cy="notifications-list"]').find('[data-cy="notification-unread-dot"]').should('not.exist');
};

export const checkLatestNotification = (expectedContent: string[], profileToNavigateTo?: string) => {
  cy.location('pathname').should('eq', '/profile');
  waitForNotificationsToLoad();
  // assert that each expected string is present in the first notification listed
  cy.get('[data-cy="notifications-list"]')
    .should('be.visible')
    .children()
    .should('have.length.at.least', 1)
    .first()
    .should(($firstNotif) => {
      expectedContent.forEach((content) => {
        expect($firstNotif).to.contain(content);
      });
    });
  // if profile name is provided, navigate to it in the notification
  if (profileToNavigateTo) {
    cy.get('[data-cy="notifications-list"]')
      .should('be.visible')
      .children()
      .should('have.length.at.least', 1)
      .first()
      .within(($firstNotif) => {
        cy.wrap($firstNotif).get('a').should('contain.text', profileToNavigateTo).contains(profileToNavigateTo).click();
      });
  }
};

// add tags to a profile using the profile tagged page
export const addProfileTags = (tags: string[]) => {
  // add the tag - TagInput submits on Enter key
  for (const tag of tags) {
    cy.get('[data-cy="add-tag-input"]').type(`${tag}{enter}`);
  }

  // wait for the tags to be added (check that the input is cleared)
  cy.get('[data-cy="add-tag-input"]').should('have.value', '');
};

export const unfollowUserByUsername = (username: string) => {
  goToProfilePageFromHeader();
  cy.get('[data-cy="profile-filter-item-following"]').click();
  // Wait for the following filter to become active
  cy.get('[data-cy="profile-filter-item-following"]').closest('[data-selected="true"]').should('exist');
  // Find the user by name and click their follow toggle button
  cy.contains('[data-cy="profile-follower-item-name"]', username)
    .closest('[data-testid^="user-list-item-"]')
    .find('[data-cy="profile-follower-item-follow-toggle-btn"]')
    .filter(':visible') // Filter to only the visible button (desktop or mobile)
    .should('be.visible')
    .and('contain.text', 'Following') // todo: fails here due to bug, button shows 'Follow' text bug, see https://github.com/pubky/franky/issues/695
    .click();
  // Verify the button now shows "Follow" (unfollowed state)
  cy.contains('[data-cy="profile-follower-item-name"]', username)
    .closest('[data-testid^="user-list-item-"]')
    .find('[data-cy="profile-follower-item-follow-toggle-btn"]')
    .filter(':visible') // Filter to only the visible button (desktop or mobile)
    .should('contain.text', 'Follow');
};

export const waitForPutLastRead = () => {
  cy.intercept({
    method: 'PUT',
    url: '/pub/pubky.app/last_read',
  }).as('putLastRead');
  cy.wait('@putLastRead').should('have.property', 'response').its('statusCode').should('eq', 201);
};

// cause last_read to be updated by clicking posts and notifications tabs
export const causeLastReadToBeUpdated = () => {
  cy.intercept({
    method: 'PUT',
    url: '/pub/pubky.app/last_read',
  }).as('putLastRead');
  cy.get('[data-cy="profile-filter-item-posts"]').click();
  // Wait for posts filter item to become active before clicking notifications
  cy.get('[data-cy="profile-filter-item-posts"]').closest('[data-selected="true"]').should('exist');
  cy.wait('@putLastRead').should('have.property', 'response').its('statusCode').should('eq', 201);
  cy.get('[data-cy="profile-filter-item-notifications"]').click();
};
