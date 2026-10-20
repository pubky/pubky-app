import { HasBackedUp } from './types/enums';

const BACKUP_DONE_BUTTON = '#backup-done-btn';
const BACKUP_DONE_CONFIRM_BUTTON = '#backup-done-confirm-btn';

// Same Done → Confirm sequence as the onboarding spec that already clears the seed.
function confirmLogoutBackup(): void {
  cy.get(BACKUP_DONE_BUTTON).click();
  cy.get('#backup-done-warning-text').should('exist');
  cy.get(BACKUP_DONE_CONFIRM_BUTTON).click();
}

// Grant-only auth keeps a browser-generated onboarding key until Done deletes the seed.
// That backup screen hides logout navigation. HasBackedUp.No always hits it. HasBackedUp.Yes
// hits it only while this browser still holds the key; a seed already deleted lands on
// `navigationSelector` (Homepage or Sign back in).
export function confirmLogoutBackupBeforeNavigation(hasBackedUp: HasBackedUp, navigationSelector: string): void {
  if (hasBackedUp === HasBackedUp.No) {
    confirmLogoutBackup();
    return;
  }

  cy.get(`${BACKUP_DONE_BUTTON}, ${navigationSelector}`).then(($elements) => {
    if ($elements.filter(BACKUP_DONE_BUTTON).length > 0) {
      confirmLogoutBackup();
    }
  });
}
