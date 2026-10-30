import { beforeEach, describe, expect, it } from 'vitest';
import { useSocialMigrationStore } from './socialMigration.store';
import { socialMigrationInitialState } from './socialMigration.types';

describe('useSocialMigrationStore', () => {
  beforeEach(() => useSocialMigrationStore.getState().reset());

  it('starts idle with nothing to show', () => {
    expect(useSocialMigrationStore.getState()).toMatchObject(socialMigrationInitialState);
  });

  it('records the stage with its reason, the progress and the run metadata, and resets to idle', () => {
    const store = useSocialMigrationStore.getState();
    store.setStage('blocked', 'quota');
    store.setNeedBytes(42);
    store.setAttempt(2);
    store.setResumedFrom({ done: 1, total: 3 });
    store.setProgress({ phase: 'migrating', pass: 'posts', done: 2, total: 3, counts: null, dropped: 1 });
    store.setSummary({ skipped: { invalid: 1 }, dropped: { profileImage: 0, profileLinks: 1 } });
    expect(useSocialMigrationStore.getState()).toMatchObject({
      stage: 'blocked',
      reason: 'quota',
      needBytes: 42,
      attempt: 2,
      resumedFrom: { done: 1, total: 3 },
      phase: 'migrating',
      pass: 'posts',
      done: 2,
      total: 3,
      dropped: 1,
      summary: { skipped: { invalid: 1 }, dropped: { profileImage: 0, profileLinks: 1 } },
    });

    store.setStage('running');
    expect(useSocialMigrationStore.getState().reason).toBeUndefined();

    store.reset();
    expect(useSocialMigrationStore.getState()).toMatchObject(socialMigrationInitialState);
  });
});
