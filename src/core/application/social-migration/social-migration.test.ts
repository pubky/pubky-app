import type { Session } from '@synonymdev/pubky';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOCIAL_MIGRATION_FLAG_PATH } from '@/config/social-migration';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { stubMemoryHomeserver } from '@/test-utils/homeserver';
import { asOpaque } from '@/test-utils/type-assertions';
import { SocialMigrationApplication } from './social-migration';

describe('SocialMigrationApplication', () => {
  let homeserver: ReturnType<typeof stubMemoryHomeserver>;
  let session: Session;
  const flagUrl = () => `pubky://${homeserver.owner}${SOCIAL_MIGRATION_FLAG_PATH}`;

  beforeEach(() => {
    homeserver = stubMemoryHomeserver(fakeOwner(1));
    session = asOpaque<Session>(homeserver.session);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('readFlag', () => {
    it('is null when the flag is absent (a 404) and passes the session to the read', async () => {
      expect(await SocialMigrationApplication.readFlag({ session, pubky: homeserver.owner })).toBeNull();
      expect(homeserver.spies.getBytesIfExists).toHaveBeenCalledWith(flagUrl(), session);
    });

    it('reads the transform revision a run recorded', async () => {
      await homeserver.session.storage.putJson(SOCIAL_MIGRATION_FLAG_PATH, { transform_rev: 7, migrated: [] });
      expect(await SocialMigrationApplication.readFlag({ session, pubky: homeserver.owner })).toBe(7);
    });

    it.each([
      ['garbage', 'not json'],
      ['a missing member', JSON.stringify({ migrated: [] })],
      ['a negative revision', JSON.stringify({ transform_rev: -1 })],
      ['a non-integer revision', JSON.stringify({ transform_rev: 1.5 })],
    ])('reads a flag with %s as revision 0, which walks the tree again', async (_, body) => {
      await homeserver.session.storage.putBytes(SOCIAL_MIGRATION_FLAG_PATH, new TextEncoder().encode(body));
      expect(await SocialMigrationApplication.readFlag({ session, pubky: homeserver.owner })).toBe(0);
    });

    it('throws a refused read instead of reporting the flag absent', async () => {
      const refused = Err.auth(AuthErrorCode.FORBIDDEN, 'Forbidden', {
        service: ErrorService.Homeserver,
        operation: 'getBytesIfExists',
        context: { statusCode: 403 },
      });
      vi.spyOn(HomeserverService, 'getBytesIfExists').mockRejectedValue(refused);

      await expect(SocialMigrationApplication.readFlag({ session, pubky: homeserver.owner })).rejects.toBe(refused);
    });

    it("refuses to read another account's flag through this session", async () => {
      await expect(SocialMigrationApplication.readFlag({ session, pubky: fakeOwner(2) })).rejects.toMatchObject({
        service: ErrorService.Homeserver,
      });
    });
  });

  describe('run', () => {
    it('hands the session, signal and callbacks to the service run', async () => {
      const run = vi.spyOn(HomeserverService, 'migrateToSocialV1').mockResolvedValue(asOpaque({ status: 'done' }));
      const { signal } = new AbortController();
      const onProgress = vi.fn();
      const onLockWait = vi.fn();

      await SocialMigrationApplication.run({ session, signal, onProgress, onLockWait });

      expect(run).toHaveBeenCalledExactlyOnceWith({ session, signal, onProgress, onLockWait });
    });
  });
});
