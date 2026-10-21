import { goToSettingsPage } from './header';
import { isMobile } from './mobile';

export type NotificationSwitch =
  'follow' | 'newFriend' | 'tagPost' | 'tagProfile' | 'mention' | 'reply' | 'repost' | 'postDeleted' | 'postEdited';

export const getNotificationSwitch = (type: NotificationSwitch) => cy.get(`[data-cy="notification-switch-${type}"]`);

// On phones the fixed new post button sits over the switch column of the last rows and the page
// cannot scroll them clear, so tap the row label, which toggles the switch it labels.
export const toggleNotificationSwitch = (type: NotificationSwitch) => {
  if (isMobile()) {
    cy.get(`[data-cy="notification-switch-${type}-label"]`).click();
    return;
  }
  getNotificationSwitch(type).click();
};

// The edit profile page has no mobile footer, so a phone user leaves it with Cancel.
export const leaveEditProfileForSettings = () => {
  if (!isMobile()) {
    goToSettingsPage();
    return;
  }
  cy.get('[data-cy="edit-profile-cancel-btn"]').click();
  cy.location('pathname').should('eq', '/settings/account');
};
