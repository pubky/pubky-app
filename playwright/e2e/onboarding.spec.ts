import { backupEncryptedFile, finishProfile, signInWithRecoveryFile, signOut, startOnboarding } from '../support/auth';
import { waitForFeed } from '../support/feed';
import { expect, test } from '../support/fixtures';
import { clickVisible, isMobileProject, open } from '../support/navigation';
import { expectVisibleProfile, goToOwnProfile } from '../support/profile';

// A slice of cypress/e2e/onboarding.cy.ts. Signup uses the real invite-code control, which is
// present on the production image. The dev-only button Cypress clicks is not.

test('can use Explore mode without signing in and shows Join Pubky dialog when clicking new post button', async ({
  page,
}) => {
  await open(page, '/');
  const explore = isMobileProject() ? '[data-cy="explore-btn"]' : '#header-explore-btn';
  await clickVisible(page, explore);
  await expect(page).toHaveURL(/\/home$/);
  await waitForFeed(page);
  await expect(page.locator('[data-cy="timeline-container"]')).toBeVisible();
  await clickVisible(page, '[data-cy="new-post-btn"]');
  await expect(page.locator('[data-cy="dialog-content"]').filter({ visible: true })).toContainText('Join Pubky');
});

test('cannot proceed with unverified invite code', async ({ page }) => {
  await page.route('**/signup_tokens/**', (route) => route.fulfill({ status: 404, body: '' }));
  await open(page, '/');
  await clickVisible(page, '#create-account-btn');
  await expect(page).toHaveURL(/\/onboarding\/human$/);
  await clickVisible(page, '[data-cy="invite-code-link"]');
  const seen = page.waitForRequest((request) => request.url().includes('/signup_tokens/'));
  await page.locator('[data-cy="human-invite-code-input"]').pressSequentially('abcd-efgh-ijkl', { delay: 20 });
  await seen;
  await expect(page.locator('[data-cy="toast"]').filter({ visible: true })).toContainText('Invalid invite code');
  await expect(page.locator('[data-cy="human-invite-code-continue-btn"]')).toBeDisabled();
  await expect(page).toHaveURL(/\/onboarding\/human$/);
});

test('redirects home when /invite/<code> verification returns 404', async ({ page }) => {
  await page.route('**/signup_tokens/**', (route) => route.fulfill({ status: 404, body: '' }));
  const toast = expect(page.locator('[data-cy="toast"]').filter({ visible: true })).toContainText(
    'Invalid invite code',
  );
  const seen = page.waitForRequest((request) => request.url().includes('/signup_tokens/'));
  await open(page, '/invite/abcd-efgh-ijkl');
  await seen;
  await expect(page).toHaveURL((url) => url.pathname === '/');
  await toast;
  await expect(page.locator('[data-cy="header-sign-in-btn"]').filter({ visible: true })).toBeVisible();
});

test('can onboard with an encrypted file, sign out, then sign in with that file', async ({ page, seed }, testInfo) => {
  const name = `Alice Example ${Date.now()}`;
  const bio = 'File backup bio';
  const filePath = testInfo.outputPath('backup.pkarr');
  await startOnboarding(page, await seed.signupToken());
  await backupEncryptedFile(page, filePath);
  await finishProfile(page, name, bio);
  await signOut(page);
  await signInWithRecoveryFile(page, filePath);
  await goToOwnProfile(page);
  await expectVisibleProfile(page, name, bio);
});

test('can sign up, sign out, then sign up again as a new user', async ({ page, seed }) => {
  await startOnboarding(page, await seed.signupToken());
  await finishProfile(page, `Casey Example ${Date.now()}`);
  await signOut(page);
  await expect(page.locator('[data-cy="header-sign-in-btn"]').filter({ visible: true })).toBeVisible();
  await startOnboarding(page, await seed.signupToken());
  await finishProfile(page, `Drew Example ${Date.now()}`);
  await expect(page).toHaveURL(/\/home$/);
});
