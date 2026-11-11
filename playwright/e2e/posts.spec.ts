import type { Page } from '@playwright/test';
import { postIndexed, userIndexed, userSearchIndexed } from '../../e2e/shared/nexus';
import { signInWithRecoveryFile } from '../support/auth';
import {
  createQuickPost,
  createQuickPostWithMention,
  deletePost,
  expectPostVisible,
  postCard,
  selectAllRecent,
} from '../support/feed';
import { expect, type SeedApi, test } from '../support/fixtures';
import { withSecondPage } from '../support/navigation';

// A slice of cypress/e2e/posts.cy.ts. Users are seeded with the shared homeserver helper and sign
// in through the recovery-file screen, because storageState cannot carry the IndexedDB keys.

async function signInSeeded(page: Page, seed: SeedApi, name: string) {
  const user = await seed.createUser(name, { withRecoveryFile: true });
  await seed.wait(userIndexed(user));
  await signInWithRecoveryFile(page, seed.recoveryFile(user.id));
  await selectAllRecent(page);
  return user;
}

test('can post from quick post box', async ({ page, seed }) => {
  await signInSeeded(page, seed, `Poster ${Date.now()}`);
  const content = `Quick post ${Date.now()}`;
  await createQuickPost(page, content);
  await expectPostVisible(page, content);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectPostVisible(page, content);
});

test('can delete a post', async ({ page, seed }) => {
  await signInSeeded(page, seed, `Deleter ${Date.now()}`);
  const content = `I can delete this post! ${Date.now()}`;
  await createQuickPost(page, content);
  await expectPostVisible(page, content);
  await deletePost(page, content);
});

test('can mention a profile picked from the @ autocomplete', async ({ page, seed }) => {
  const stamp = Date.now();
  const mentioned = await seed.createUser(`Mention Me ${String(stamp).slice(-6)}`);
  const author = await seed.createUser(`Author ${stamp}`, { withRecoveryFile: true });
  await seed.wait(userIndexed(author), userSearchIndexed(mentioned));
  await signInWithRecoveryFile(page, seed.recoveryFile(author.id));
  await selectAllRecent(page);
  await createQuickPostWithMention(page, mentioned.name);
  await expect(
    postCard(page, mentioned.name).locator(`[data-cy="post-text"] a[href="/profile/${mentioned.id}"]`),
  ).toContainText(`@${mentioned.name}`);
});

test('user B sees a post user A published from another browser context', async ({ page, browser, seed }) => {
  const stamp = Date.now();
  const alice = await seed.createUser(`Alice Example ${stamp}`, { withRecoveryFile: true });
  const bob = await seed.createUser(`Bob Example ${stamp}`, { withRecoveryFile: true });
  await seed.wait(userIndexed(alice), userIndexed(bob));
  await signInWithRecoveryFile(page, seed.recoveryFile(alice.id));
  await selectAllRecent(page);
  const content = `Hello from Alice ${stamp}`;
  const postId = await createQuickPost(page, content);
  if (postId) await seed.wait(postIndexed({ id: postId, authorId: alice.id }));
  await expectPostVisible(page, content);

  await withSecondPage(browser, async (bobPage) => {
    await signInWithRecoveryFile(bobPage, seed.recoveryFile(bob.id));
    await selectAllRecent(bobPage);
    await expectPostVisible(bobPage, content);
  });
});
