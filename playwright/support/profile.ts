import { expect, type Page } from '@playwright/test';
import { clickVisible, isMobileProject, open } from './navigation';

export async function openProfileTab(page: Page, tab: string) {
  const selector = isMobileProject()
    ? `[data-cy="profile-mobile-tab-${tab === 'tagged' ? 'unique_tags' : tab}"]`
    : `[data-cy="profile-filter-item-${tab}"]`;
  await clickVisible(page, selector);
}

export async function goToOwnProfile(page: Page) {
  const path = new URL(page.url()).pathname;
  if (path !== '/profile' && !path.startsWith('/profile/')) {
    const selector = isMobileProject() ? '[data-cy="footer-nav-profile-btn"]' : '[data-cy="header-nav-profile-btn"]';
    await clickVisible(page, selector);
  }
  await expect(page).toHaveURL(/\/profile/, { timeout: 30_000 });
  if (isMobileProject()) await openProfileTab(page, 'profile');
}

export async function expectVisibleProfile(page: Page, name: string, bio: string) {
  if (isMobileProject()) await openProfileTab(page, 'profile');
  await expect(page.locator('[data-cy="profile-username-header"]').filter({ visible: true })).toHaveText(name);
  await expect(page.locator('[data-cy="profile-bio-header"]').filter({ visible: true })).toHaveText(bio);
}

export async function openEditProfile(page: Page) {
  await goToOwnProfile(page);
  const origin = new URL(page.url()).pathname;
  await clickVisible(page, '[data-cy="profile-edit-btn"]');
  await expect(page).toHaveURL(/\/settings\/edit$/);
  return origin;
}

export function taggedSection(page: Page) {
  return page.locator('[data-cy="profile-tagged-section"]').filter({ visible: true });
}

export async function addProfileTags(page: Page, tags: string[]) {
  const input = page.locator('[data-cy="add-tag-input"]').filter({ visible: true }).first();
  for (const tag of tags) {
    await input.fill(tag);
    await input.press('Enter');
    await expect(input).toHaveValue('');
  }
}

async function searchInput(page: Page) {
  if (isMobileProject() && !new URL(page.url()).pathname.startsWith('/search')) {
    await clickVisible(page, '[data-cy="footer-nav-search-btn"]');
    await expect(page).toHaveURL(/\/search$/);
  }
  return page.locator('[data-cy="header-search-input"]').filter({ visible: true }).first();
}

export async function searchForProfileByPubky(page: Page, pubky: string, id: string, name: string) {
  const input = await searchInput(page);
  await input.fill(pubky);
  const suggestion = page.locator(`[data-cy="search-user-suggestion-${id}"]`);
  await expect(suggestion).toBeVisible({ timeout: 30_000 });
  await suggestion.click();
  await expect(page.locator('[data-cy="profile-username-header"]').filter({ visible: true })).toHaveText(name);
}

export async function openOwnFollowers(page: Page) {
  await open(page, '/profile/followers');
  await expect(page).toHaveURL(/\/profile\/followers$/);
}
