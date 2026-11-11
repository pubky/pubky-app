import { expect, type Page } from '@playwright/test';
import { waitForFeed } from './feed';
import { clickVisible, open } from './navigation';
import { goToOwnProfile } from './profile';

const SLOW = 90_000;

export async function enterInviteAndContinue(page: Page, inviteCode: string) {
  await clickVisible(page, '[data-cy="invite-code-link"]');
  const input = page.locator('[data-cy="human-invite-code-input"]');
  await input.click();
  await input.pressSequentially(inviteCode, { delay: 20 });
  const continueBtn = page.locator('[data-cy="human-invite-code-continue-btn"]');
  await expect(continueBtn).toBeEnabled({ timeout: 30_000 });
  await continueBtn.click();
  await expect(page).toHaveURL(/\/onboarding\/install$/, { timeout: SLOW });
}

// From the landing page through the backup step, with a real signup token. The key stays in
// IndexedDB; callers that need another session sign in again through the UI.
export async function startOnboarding(page: Page, inviteCode: string) {
  await open(page, '/');
  await clickVisible(page, '#create-account-btn');
  await expect(page).toHaveURL(/\/onboarding\/human$/);
  await enterInviteAndContinue(page, inviteCode);
  await clickVisible(page, '#create-keys-in-browser-btn');
  await expect(page).toHaveURL(/\/onboarding\/pubky$/, { timeout: SLOW });
  // While the key is generated the field shows "Generating pubky...", which does not match.
  await expect(page.locator('[data-cy="pubky-display"]')).toHaveValue(/^pubky/, { timeout: SLOW });
  await clickVisible(page, '#public-key-navigation-continue-btn');
  await expect(page).toHaveURL(/\/onboarding\/backup$/);
}

export async function backupEncryptedFile(page: Page, savePath: string) {
  await clickVisible(page, '#backup-encrypted-file-btn');
  await page.locator('#password').fill('123456');
  await page.locator('#confirmPassword').fill('123456');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download-file-btn').click();
  await (await downloadPromise).saveAs(savePath);
  await page.locator('#backup-successful-ok-btn').click();
}

export async function finishProfile(page: Page, name: string, bio = '') {
  await clickVisible(page, '#backup-navigation-continue-btn');
  await expect(page).toHaveURL(/\/onboarding\/profile$/);
  await page.locator('#profile-name-input').fill(name);
  if (bio) await page.locator('#profile-bio-input').fill(bio);
  await page.locator('#profile-finish-btn').filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/onboarding\/tags$/, { timeout: SLOW });
  await page.locator('[data-testid="tags-of-interest-form"] #profile-finish-btn').click();
  await expect(page).toHaveURL(/\/onboarding\/follow$/);
  await expect(
    page.locator('[data-testid="suggested-people-grid"], [data-testid="suggested-people-empty"]').first(),
  ).toBeVisible({ timeout: SLOW });
  const finish = page.locator('[data-cy="follow-best-matches-form"] #profile-finish-btn');
  await expect(finish).toBeEnabled();
  await finish.click();
  await expect(page).toHaveURL(/\/home$/, { timeout: SLOW });
  await expect(page.locator('#welcome-title')).toBeVisible();
  await page.locator('#welcome-explore-pubky-btn').click();
  await waitForFeed(page);
}

export async function signOut(page: Page) {
  await goToOwnProfile(page);
  await clickVisible(page, '[data-cy="profile-logout-btn"]');
  await expect(page).toHaveURL(/\/logout$/);
  const backupDone = page.locator('#backup-done-btn');
  const needsBackupConfirm = await backupDone
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (needsBackupConfirm) {
    await backupDone.click();
    await page.locator('#backup-done-confirm-btn').click();
  }
  await page.locator('#logout-navigation-back-btn').click();
  await expect(page).toHaveURL((url) => url.pathname === '/');
}

// Restores a recovery file through the sign-in screen. storageState cannot carry the
// non-extractable IndexedDB keys, so every signed-in test starts here.
export async function signInWithRecoveryFile(page: Page, filePath: string) {
  await open(page, '/');
  await clickVisible(page, '[data-cy="header-sign-in-btn"]');
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.locator('#restore-encrypted-file-btn').click();
  await page.locator('#encrypted-file-input').setInputFiles(filePath);
  await page.locator('#restore-password').fill('123456');
  await page.locator('#encrypted-file-restore-btn').click();
  await expect(page).toHaveURL(/\/home$/, { timeout: SLOW });
  await waitForFeed(page);
}
