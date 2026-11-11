import { SOCIAL_MIGRATION_FLAG_PATH } from '../../src/config/social-migration';
import { parseRequestBody } from './nexus';

// Spec-side helpers for the social v1 migration gate (`/migration`): the clean run and the interrupted
// runs in onboarding.cy.ts sign a 0.x account in and read what the run wrote.

const MIGRATION_SCREEN_HOLD_MS = 3000;

/** The done flag the migrator writes last, on whichever host serves the user's tree. */
export const MIGRATION_FLAG_GLOB = `**${SOCIAL_MIGRATION_FLAG_PATH}`;

/** What a run recorded in its done flag: the 0.x paths it copied and those it left, by reason. */
export type MigrationFlag = { migrated: string[]; skipped: Record<string, string[]> };

/** The owner-relative path the migrator records for a 0.x post. */
export const legacyPostPath = (post: { id: string }) => `pub/pubky.app/posts/${post.id}`;

/**
 * A tree this small migrates in a moment. The done flag is written last, so holding its answer
 * back keeps the progress screen up long enough to see it. Aliased `@migrationDone`.
 */
export const holdMigrationFlag = () => {
  cy.intercept('PUT', MIGRATION_FLAG_GLOB, (req) => {
    req.on('response', (res) => {
      res.setDelay(MIGRATION_SCREEN_HOLD_MS);
    });
  }).as('migrationDone');
};

/**
 * Every run opens with one HEAD of the done flag. A resumed run says where it continues from only until its
 * walk starts, so holding that probe back keeps "Continuing from an earlier run" on screen long enough to see it.
 */
export const holdMigrationProbe = () => {
  cy.intercept({ method: 'HEAD', url: MIGRATION_FLAG_GLOB }, (req) => {
    req.on('response', (res) => {
      res.setDelay(MIGRATION_SCREEN_HOLD_MS);
    });
  });
};

/** The flag the run wrote, once it landed (`holdMigrationFlag` first). */
export const migrationFlag = () =>
  cy.wait('@migrationDone').then(({ request, response }) => {
    expect(response?.statusCode, 'flag write').to.eq(201);
    return parseRequestBody(request.body) as MigrationFlag;
  });

/**
 * Waits for the Copying step to be under way. Every step's label is on screen in every phase; the count beside
 * the bar is the one thing that renders only while objects are being copied.
 */
export const waitForMigrationCopying = () => {
  cy.get('[data-testid="social-migration-progress"]')
    .invoke('text')
    .should('match', /\d+ of \d+/);
};
