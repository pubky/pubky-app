import type { MigrationReport } from 'pubky-social-migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SocialMigrationController } from '@/controllers/social-migration/social-migration';
import { SocialMigrationCoordinator } from '@/coordinators/social-migration/social-migration';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockRingSession, mockSession } from '@/test-utils/pubky';
import { asOpaque } from '@/test-utils/type-assertions';

const PUBKY = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;

const signIn = (session = mockSession()) =>
  useAuthStore.getState().init({ session, currentUserPubky: PUBKY, hasProfile: true });

describe('SocialMigrationCoordinator', () => {
  let signals: AbortSignal[];
  let finish: () => void;

  beforeEach(() => {
    signals = [];
    SocialMigrationCoordinator.resetInstance();
    useAuthStore.getState().reset();
    // reset() keeps the logout flag, which logout clears itself
    useAuthStore.getState().setIsLoggingOut(false);
    vi.spyOn(SocialMigrationController, 'migrate').mockImplementation((signal) => {
      signals.push(signal);
      return new Promise((resolve) => {
        finish = () => resolve(asOpaque<MigrationReport>({ status: 'done' }));
      });
    });
  });

  afterEach(() => {
    SocialMigrationCoordinator.resetInstance();
    useAuthStore.getState().reset();
    vi.restoreAllMocks();
  });

  it('migrates once per session when it is ready', async () => {
    SocialMigrationCoordinator.getInstance().start();
    signIn();
    useAuthStore.getState().setIsLoggingOut(false);

    expect(SocialMigrationController.migrate).toHaveBeenCalledTimes(1);
    finish();
    await Promise.resolve();
    useAuthStore.getState().setIsLoggingOut(false);
    expect(SocialMigrationController.migrate).toHaveBeenCalledTimes(1);
  });

  it('waits for a session that holds the migration grant', () => {
    SocialMigrationCoordinator.getInstance().start();
    signIn(mockRingSession(['/pub/pubky.app/:rw']));
    expect(SocialMigrationController.migrate).not.toHaveBeenCalled();

    signIn();
    expect(SocialMigrationController.migrate).toHaveBeenCalledTimes(1);
  });

  it('stops the run when logout begins', () => {
    SocialMigrationCoordinator.getInstance().start();
    signIn();

    useAuthStore.getState().setIsLoggingOut(true);

    expect(signals[0].aborted).toBe(true);
  });

  it('runs again after a stop cut the run short', () => {
    const coordinator = SocialMigrationCoordinator.getInstance();
    coordinator.start();
    signIn();
    coordinator.stop();
    expect(signals[0].aborted).toBe(true);

    coordinator.start();

    expect(SocialMigrationController.migrate).toHaveBeenCalledTimes(2);
    expect(signals[1].aborted).toBe(false);
  });

  it('does nothing before start', () => {
    SocialMigrationCoordinator.getInstance();
    signIn();

    expect(SocialMigrationController.migrate).not.toHaveBeenCalled();
  });
});
