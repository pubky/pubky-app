import type { Page } from '@playwright/test';
import { followIndexed, userIndexed, userSearchIndexed } from '../../e2e/shared/nexus';
import { signInWithRecoveryFile } from '../support/auth';
import { expect, type SeedApi, test } from '../support/fixtures';
import { isMobileProject, open, withSecondPage } from '../support/navigation';
import {
  addProfileTags,
  expectVisibleProfile,
  goToOwnProfile,
  openEditProfile,
  openProfileTab,
  searchForProfileByPubky,
  taggedSection,
} from '../support/profile';

// A slice of cypress/e2e/profile.cy.ts, plus a two-context follow. Seeded users sign in with the
// recovery file the shared seed writes.

async function signInSeeded(page: Page, seed: SeedApi, name: string, bio = '') {
  const user = await seed.createUser(name, { bio, withRecoveryFile: true });
  await seed.wait(userIndexed(user));
  await signInWithRecoveryFile(page, seed.recoveryFile(user.id));
  return user;
}

test('editing should retain any changes made to own profile', async ({ page, seed }) => {
  await signInSeeded(page, seed, `Edit Me ${Date.now()}`, 'This bio is editable');
  await openEditProfile(page);
  await page.locator('#profile-name-input').fill('Edited Name');
  await page.locator('#profile-bio-input').fill('This bio has been edited.');
  await page.locator('[data-cy="edit-profile-save-btn"]').click();
  await expect(page).toHaveURL(/\/profile/);
  await expectVisibleProfile(page, 'Edited Name', 'This bio has been edited.');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectVisibleProfile(page, 'Edited Name', 'This bio has been edited.');
});

test('cancelling edit should not retain any changes made to own profile', async ({ page, seed }) => {
  const name = `Edit Me ${Date.now()}`;
  const bio = 'This bio is editable';
  await signInSeeded(page, seed, name, bio);
  const origin = await openEditProfile(page);
  await page.locator('#profile-name-input').fill('Name Not Changed');
  await page.locator('#profile-bio-input').fill('Bio Not Changed');
  await page.locator('[data-cy="edit-profile-cancel-btn"]').click();
  await expect(page).toHaveURL((url) => url.pathname === origin);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectVisibleProfile(page, name, bio);
});

test('can tag own profile', async ({ page, seed }) => {
  await signInSeeded(page, seed, `Tag Self ${Date.now()}`);
  await goToOwnProfile(page);
  await expect(taggedSection(page)).toContainText('No tags added yet.');
  await openProfileTab(page, 'tagged');
  await addProfileTags(page, ['me-1', 'me-2']);
  await expect(page.locator('[data-cy="profile-tab-content"]').filter({ visible: true })).toContainText('me-1');
  await expect(page.locator('[data-cy="profile-tab-content"]').filter({ visible: true })).toContainText('me-2');
  await openProfileTab(page, isMobileProject() ? 'profile' : 'notifications');
  await expect(taggedSection(page)).toContainText('me-1');
  await expect(taggedSection(page)).toContainText('me-2');
});

test('user A follows user B and B sees the follow from another browser context', async ({ page, browser, seed }) => {
  const stamp = Date.now();
  const alice = await seed.createUser(`Alice Example ${stamp}`, { withRecoveryFile: true });
  const bob = await seed.createUser(`Bob Example ${stamp}`, { withRecoveryFile: true });
  await seed.wait(userIndexed(alice), userIndexed(bob), userSearchIndexed(bob));
  await signInWithRecoveryFile(page, seed.recoveryFile(alice.id));
  await searchForProfileByPubky(page, bob.pubky, bob.id, bob.name);
  const follow = page.locator('[data-cy="profile-follow-toggle-btn"]').filter({ visible: true }).first();
  await expect(follow).toHaveText('Follow');
  const followed = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' && response.url().includes('/pub/pubky.app/follows/') && response.ok(),
    { timeout: 60_000 },
  );
  await follow.click();
  await followed;
  await expect(follow).toContainText('Following');
  await seed.wait(followIndexed(alice, bob));

  await withSecondPage(browser, async (bobPage) => {
    await signInWithRecoveryFile(bobPage, seed.recoveryFile(bob.id));
    await open(bobPage, '/profile/followers');
    await expect(bobPage).toHaveURL(/\/profile\/followers$/);
    await expect(bobPage.locator('[data-cy="profile-follower-item-name"]').filter({ hasText: alice.name })).toBeVisible(
      {
        timeout: 45_000,
      },
    );
  });
});
