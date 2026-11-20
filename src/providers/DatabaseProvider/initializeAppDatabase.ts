import { db } from '@/database/franky/franky';
import { useMigrationStore } from '@/stores/migration/migration.store';

let initializing: Promise<void> | undefined;

/** The public Passport CTA can overlap navigation into the app. Share any active version check or migration. */
export function initializeAppDatabase({ allowRecreate } = { allowRecreate: true }): Promise<void> {
  initializing ??= db
    .initialize({ allowRecreate })
    .then(({ wasDbReset }) => {
      if (wasDbReset) useMigrationStore.getState().setWasDbReset(true);
    })
    .finally(() => {
      initializing = undefined;
    });
  return initializing;
}
