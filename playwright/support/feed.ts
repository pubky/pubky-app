import { expect, type Page } from '@playwright/test';
import { clickVisible, isMobileProject, reload } from './navigation';

export async function waitForFeed(page: Page) {
  const container = page.locator('[data-cy="timeline-container"]');
  await expect(container).toBeVisible({ timeout: 60_000 });
  await expect(container).not.toContainText('Loading posts...', { timeout: 30_000 });
  await expect(container).not.toContainText('Loading header...');
  await expect(container).not.toContainText('Loading content...');
}

export function postCard(page: Page, text: string) {
  return page.locator('[data-cy="timeline-container"] [data-cy="post-card"]').filter({ hasText: text });
}

// A post published after the feed loaded is either already in the timeline or behind See new posts.
export async function expectPostVisible(page: Page, text: string) {
  const card = postCard(page, text).first();
  const button = page.locator('[data-cy="new-posts-button"]').filter({ visible: true });
  await expect(async () => {
    if (await card.isVisible().catch(() => false)) return;
    if (await button.count()) await button.first().click();
    await expect(card).toBeVisible();
  }).toPass({ timeout: 45_000 });
}

async function selectFeedToggle(page: Page, group: 'reach' | 'sort', dataCy: string) {
  const toggle = `[data-cy="filter-${group}-radiogroup"] [data-cy="${dataCy}"]`;
  if (!isMobileProject()) {
    await page.locator(toggle).filter({ visible: true }).first().click();
    return;
  }
  await clickVisible(page, '[data-cy="mobile-header-left-btn"]');
  const drawer = page.locator('[data-cy="side-drawer-left"]');
  await expect(drawer).toBeVisible();
  await drawer.locator(toggle).click();
  const overlay = page.locator('[data-cy="side-drawer-left-overlay"]');
  if (await overlay.isVisible().catch(() => false)) {
    const box = await overlay.boundingBox();
    if (box) await overlay.click({ position: { x: Math.max(box.width - 8, 0), y: box.height / 2 } });
  }
  await expect(drawer).toBeHidden({ timeout: 10_000 });
}

// Own posts are hidden on Following. All + Recent is where a post the viewer did not follow shows up.
export async function selectAllRecent(page: Page) {
  await selectFeedToggle(page, 'reach', 'all-reach-toggle');
  await waitForFeed(page);
  await selectFeedToggle(page, 'sort', 'recent-sort-toggle');
  await waitForFeed(page);
}

/** Publishes from the home composer. Returns the post id when the homeserver URL includes it. */
export async function createQuickPost(page: Page, content: string) {
  const composer = page.locator('[data-cy="home-post-input"]');
  await expect(composer).toBeVisible();
  const textarea = composer.locator('[data-cy="post-input-textarea"]');
  await textarea.fill(content);
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().includes('/pub/pubky.app/posts/') &&
      response.status() === 201,
    { timeout: 60_000 },
  );
  await composer.locator('[data-cy="post-input-action-bar-post"]').click();
  const response = await created;
  await expect(textarea).toHaveValue('');
  return /\/posts\/([^/?#]+)/.exec(response.url())?.[1];
}

// Types the mention one character at a time so the autocomplete sees the same input Cypress `type` sends.
export async function createQuickPostWithMention(page: Page, name: string) {
  const composer = page.locator('[data-cy="home-post-input"]');
  await expect(composer).toBeVisible();
  const textarea = composer.locator('[data-cy="post-input-textarea"]');
  await textarea.click();
  await textarea.pressSequentially(`Hey @${name}`, { delay: 30 });
  await page.locator('[data-cy="mention-popover"]').getByText(name).first().click();
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().includes('/pub/pubky.app/posts/') &&
      response.status() === 201,
    { timeout: 60_000 },
  );
  await composer.locator('[data-cy="post-input-action-bar-post"]').click();
  await created;
  await expect(textarea).toHaveValue('');
}

export async function deletePost(page: Page, content: string) {
  const card = postCard(page, content).first();
  await card.locator('[data-cy="post-more-btn"]').filter({ visible: true }).first().click();
  await page.locator('[data-cy="post-menu-action-delete"]').click();
  await page.locator('[data-cy="dialog-content"] [data-cy="dialog-confirm-delete-btn"]').click();
  await expect(page.locator('[data-cy="dialog-content"]')).toBeHidden();
  await expect(page.locator('[data-cy="timeline-posts"]')).not.toContainText(content);
  await reload(page);
  await waitForFeed(page);
  await expect(page.locator('[data-cy="timeline-posts"]')).not.toContainText(content);
}
