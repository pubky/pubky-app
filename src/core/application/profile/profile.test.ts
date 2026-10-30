import { decodeObject } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileApplication } from '@/application/profile/profile';
import { ClientErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { httpStatusCodeToError } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { UserTtlModel } from '@/models/user/ttl/userTtl';
import { UserNormalizer } from '@/pipes/user/user.normalizer';
import {
  HOMESERVER_PUBLISH_CONFLICT_MESSAGE,
  installHomeserverWriteRetryDependenciesForTests,
} from '@/services/homeserver/write-retry';
import { LocalProfileService } from '@/services/local/profile/profile';
import { NexusBootstrapService } from '@/services/nexus/bootstrap/bootstrap';
import { useAuthStore } from '@/stores/auth/auth.store';
import { stubMemoryHomeserver } from '@/test-utils/homeserver';
import { asOpaque } from '@/test-utils/type-assertions';

// Mock Nexus bootstrap service (fire-and-forget ingest call in commitCreate)
vi.mock('@/services/nexus/bootstrap/bootstrap', () => ({
  NexusBootstrapService: {
    ingest: vi.fn(() => Promise.resolve()),
  },
}));

const owner = fakeOwner(1) as Pubky;
const PROFILE_PATH = '/pub/social/v1/profile.json';
const LEGACY_PROFILE_PATH = '/pub/pubky.app/profile.json';
const profileUrl = `pubky://${owner}${PROFILE_PATH}`;
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

/** The stored v1 profile, with a member and a link member this client does not know. */
const published = {
  name: 'Test User',
  bio: 'Test bio',
  image: `pubky://${owner}/pub/social/v1/files/AKSZ57W2RFKHV1EHK007FQQ8TW.png`,
  links: [{ title: 'WEBSITE', url: 'https://example.com/', icon: 'globe' }],
  status: 'working',
  theme: 'dark',
};
/** The same profile as the data model hands it to local state. */
const publishedFields = {
  name: published.name,
  bio: published.bio,
  image: published.image,
  links: [{ title: 'WEBSITE', url: 'https://example.com/' }],
  status: published.status,
};
// A cached row that predates the last avatar change
const staleRow = {
  id: owner,
  ...publishedFields,
  image: `pubky://${owner}/pub/social/v1/files/OLD.png`,
  status: 'available',
  indexed_at: 1_000,
  nexusIndexedAt: 1_000,
};

describe('ProfileApplication', () => {
  let homeserver: ReturnType<typeof stubMemoryHomeserver>;
  const stored = async () =>
    JSON.parse(new TextDecoder().decode(await homeserver.session.storage.getBytes(PROFILE_PATH)));
  const putBodies = () =>
    homeserver.spies.putBlob.mock.calls.map(([params]) => JSON.parse(new TextDecoder().decode(params.blob)));

  beforeEach(async () => {
    vi.clearAllMocks();
    homeserver = stubMemoryHomeserver(owner);
    vi.spyOn(Logger, 'error').mockImplementation(() => {});
    vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger, 'info').mockImplementation(() => {});
    vi.spyOn(Logger, 'debug').mockImplementation(() => {});
    await UserDetailsModel.table.clear();
    await UserTtlModel.table.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('commitCreate', () => {
    const authState = { setCurrentUserPubky: vi.fn(), setHasProfile: vi.fn() };

    beforeEach(() => {
      vi.spyOn(useAuthStore, 'getState').mockReturnValue(asOpaque<ReturnType<typeof useAuthStore.getState>>(authState));
    });

    it('writes the built profile bytes to the v1 path, stores it locally and sets auth state', async () => {
      const profile = UserNormalizer.to(
        {
          name: 'Alice',
          bio: 'Alice bio',
          image: null,
          links: [{ title: 'Website', url: 'https://example.com' }],
          status: '',
        },
        owner,
      );

      await ProfileApplication.commitCreate({ profile, pubky: owner });

      expect(homeserver.spies.putBlob).toHaveBeenCalledExactlyOnceWith({ url: profileUrl, blob: profile.body });
      expect(await stored()).toEqual(profile.object);
      expect(NexusBootstrapService.ingest).toHaveBeenCalledWith(owner);
      expect(authState.setCurrentUserPubky).toHaveBeenCalledWith(owner);
      expect(authState.setHasProfile).toHaveBeenCalledWith(true);

      const localProfile = await UserDetailsModel.findById(owner);
      expect(localProfile).toMatchObject({
        id: owner,
        name: 'Alice',
        bio: 'Alice bio',
        image: null,
        links: [{ title: 'Website', url: 'https://example.com' }],
        status: null,
        localUpdatedAt: expect.any(Number),
      });
      expect(localProfile?.nexusIndexedAt).toBeUndefined();
      expect(await UserTtlModel.findById(owner)).toMatchObject({ lastUpdatedAt: localProfile?.localUpdatedAt });
    });

    it('does not persist the local profile when the homeserver write fails', async () => {
      const profile = UserNormalizer.to({ name: 'Bob', bio: '', image: null, links: [], status: '' }, owner);
      homeserver.spies.putBlob.mockRejectedValueOnce(new Error('create failed'));

      await expect(ProfileApplication.commitCreate({ profile, pubky: owner })).rejects.toThrow('create failed');

      // Auth state should not be modified on error (see TODO in profile.ts)
      expect(authState.setHasProfile).not.toHaveBeenCalled();
      expect(authState.setCurrentUserPubky).not.toHaveBeenCalled();
      // Ingest only fires after profile.json is actually saved
      expect(NexusBootstrapService.ingest).not.toHaveBeenCalled();
      expect(await UserDetailsModel.findById(owner)).toBeNull();
    });
  });

  describe('writes on top of the stored profile', () => {
    beforeEach(async () => {
      await homeserver.session.storage.putBytes(PROFILE_PATH, encode(published));
      homeserver.spies.putBlob.mockClear();
    });

    describe('commitUpdateStatus', () => {
      it('publishes the stored profile with only the new status, even when the cached row is stale', async () => {
        await UserDetailsModel.create(staleRow);

        await ProfileApplication.commitUpdateStatus({ pubky: owner, status: '🪚building' });

        expect(homeserver.spies.getFreshBytes).toHaveBeenCalledWith(profileUrl);
        expect(homeserver.spies.putBlob).toHaveBeenCalledOnce();
        expect(homeserver.spies.putBlob.mock.calls[0][0]).toMatchObject({ url: profileUrl, fence: expect.anything() });
        expect(await stored()).toEqual({ ...published, status: '🪚building' });
      });

      it('keeps the members a newer writer added, on the profile and on its links', async () => {
        await ProfileApplication.commitUpdateStatus({ pubky: owner, status: 'back' });

        const bytes = await homeserver.session.storage.getBytes(PROFILE_PATH);
        expect(decodeObject(profileUrl, bytes, 'user')).toMatchObject({
          status: 'back',
          $unknown: JSON.stringify({ theme: 'dark' }),
          links: [{ title: 'WEBSITE', url: 'https://example.com/', $unknown: JSON.stringify({ icon: 'globe' }) }],
        });
      });

      it('stores exactly the published profile as a pending local edit', async () => {
        await UserDetailsModel.create(staleRow);

        await ProfileApplication.commitUpdateStatus({ pubky: owner, status: '🪚building' });

        const row = await UserDetailsModel.findById(owner);
        expect(row).toMatchObject({ ...publishedFields, status: '🪚building', nexusIndexedAt: 1_000, deleted: false });
        expect(row?.localUpdatedAt).toEqual(expect.any(Number));
        expect(await UserTtlModel.findById(owner)).toMatchObject({ lastUpdatedAt: row?.localUpdatedAt });
      });

      it('creates the local row when it is missing', async () => {
        await ProfileApplication.commitUpdateStatus({ pubky: owner, status: '🪚building' });

        const row = await UserDetailsModel.findById(owner);
        expect(row).toMatchObject({ id: owner, ...publishedFields, status: '🪚building' });
        expect(row?.localUpdatedAt).toEqual(expect.any(Number));
        expect(await UserTtlModel.findById(owner)).toMatchObject({ lastUpdatedAt: row?.localUpdatedAt });
      });

      it('clears the status', async () => {
        await ProfileApplication.commitUpdateStatus({ pubky: owner, status: '' });

        expect(await stored()).toEqual({ ...published, status: null });
        expect((await UserDetailsModel.findById(owner))?.status).toBeNull();
      });

      it('clears a cached tombstone after the status is written', async () => {
        await UserDetailsModel.create({ ...staleRow, deleted: true });

        await ProfileApplication.commitUpdateStatus({ pubky: owner, status: 'back' });

        expect((await UserDetailsModel.findById(owner))?.deleted).toBe(false);
      });

      it('refuses a status outside the profile rules before writing anything', async () => {
        await UserDetailsModel.create(staleRow);

        await expect(
          ProfileApplication.commitUpdateStatus({ pubky: owner, status: 'x'.repeat(51) }),
        ).rejects.toMatchObject({
          code: ValidationErrorCode.INVALID_INPUT,
          service: ErrorService.SocialSpecs,
          operation: 'commitUpdateStatus',
          context: { pubky: owner, field: 'status' },
        });

        expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
        expect(await stored()).toEqual(published);
        expect(await UserDetailsModel.findById(owner)).toMatchObject({ status: 'available' });
      });

      describe('when the homeserver refuses the PUT', () => {
        const homeserverError = (statusCode: number, body: string) =>
          httpStatusCodeToError(
            statusCode,
            `Request failed: Server responded with an error: ${statusCode} Conflict - ${body}`,
            ErrorService.Homeserver,
            'putBlob',
            profileUrl,
          );

        beforeEach(() => {
          installHomeserverWriteRetryDependenciesForTests({ sleep: async () => {}, random: () => 0 });
        });

        afterEach(() => {
          installHomeserverWriteRetryDependenciesForTests(null);
        });

        it('re-reads profile.json after the publish conflict and writes on top of the newer copy', async () => {
          homeserver.spies.putBlob.mockImplementationOnce(async () => {
            // Another device saves a bio while this write is refused
            await homeserver.session.storage.putBytes(PROFILE_PATH, encode({ ...published, bio: 'edited elsewhere' }));
            throw homeserverError(409, HOMESERVER_PUBLISH_CONFLICT_MESSAGE);
          });

          await ProfileApplication.commitUpdateStatus({ pubky: owner, status: 'back' });

          expect(homeserver.spies.getFreshBytes).toHaveBeenCalledTimes(2);
          expect(putBodies()).toEqual([
            { ...published, status: 'back' },
            { ...published, bio: 'edited elsewhere', status: 'back' },
          ]);
          expect(await stored()).toEqual({ ...published, bio: 'edited elsewhere', status: 'back' });
          expect(await UserDetailsModel.findById(owner)).toMatchObject({ bio: 'edited elsewhere', status: 'back' });
        });

        it('does not re-read or retry a path collision', async () => {
          homeserver.spies.putBlob.mockRejectedValueOnce(homeserverError(409, 'File/folder path collision'));

          await expect(ProfileApplication.commitUpdateStatus({ pubky: owner, status: 'back' })).rejects.toMatchObject({
            context: { statusCode: 409 },
          });
          expect(homeserver.spies.getFreshBytes).toHaveBeenCalledOnce();
          expect(homeserver.spies.putBlob).toHaveBeenCalledOnce();
          expect(await stored()).toEqual(published);
        });
      });

      it('refuses a deleted profile without writing anything', async () => {
        await UserDetailsModel.create(staleRow);
        await homeserver.session.storage.delete(PROFILE_PATH);

        await expect(ProfileApplication.commitUpdateStatus({ pubky: owner, status: 'back' })).rejects.toMatchObject({
          code: ClientErrorCode.GONE,
          message: 'Cannot update the status of a deleted profile',
        });

        expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
        expect(await UserDetailsModel.findById(owner)).toMatchObject({ status: 'available' });
      });

      it('never falls back to a 0.x profile: an account with only that one reads as deleted', async () => {
        await homeserver.session.storage.delete(PROFILE_PATH);
        await homeserver.session.storage.putBytes(LEGACY_PROFILE_PATH, encode(publishedFields));

        await expect(ProfileApplication.commitUpdateStatus({ pubky: owner, status: 'back' })).rejects.toMatchObject({
          code: ClientErrorCode.GONE,
        });

        expect(homeserver.spies.getFreshBytes).toHaveBeenCalledExactlyOnceWith(profileUrl);
        expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
      });

      it('writes nothing when the homeserver read fails', async () => {
        await UserDetailsModel.create(staleRow);
        homeserver.spies.getFreshBytes.mockRejectedValue(new Error('Network error'));

        await expect(ProfileApplication.commitUpdateStatus({ pubky: owner, status: 'back' })).rejects.toThrow(
          'Network error',
        );

        expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
        expect(await UserDetailsModel.findById(owner)).toMatchObject({ status: 'available' });
      });

      it('writes nothing when the stored profile does not decode', async () => {
        await homeserver.session.storage.putBytes(PROFILE_PATH, encode({ name: 42 }));

        await expect(ProfileApplication.commitUpdateStatus({ pubky: owner, status: 'back' })).rejects.toMatchObject({
          code: ValidationErrorCode.INVALID_INPUT,
          service: ErrorService.SocialSpecs,
        });

        expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
        expect(await UserDetailsModel.findById(owner)).toBeNull();
      });

      it('keeps the local row when the homeserver write fails', async () => {
        await UserDetailsModel.create(staleRow);
        homeserver.spies.putBlob.mockRejectedValue(new Error('Network error'));

        await expect(ProfileApplication.commitUpdateStatus({ pubky: owner, status: 'back' })).rejects.toThrow(
          'Network error',
        );

        expect(await UserDetailsModel.findById(owner)).toMatchObject({ status: 'available' });
      });

      it('runs overlapping writes one at a time, so the later action lands last', async () => {
        let releaseFirstRead!: () => void;
        const current = await homeserver.session.storage.getBytes(PROFILE_PATH);
        homeserver.spies.getFreshBytes.mockReturnValueOnce(
          new Promise((resolve) => {
            releaseFirstRead = () => resolve(current);
          }),
        );

        const first = ProfileApplication.commitUpdateStatus({ pubky: owner, status: 'away' });
        const second = ProfileApplication.commitUpdateStatus({ pubky: owner, status: '🪚building' });
        await vi.waitFor(() => expect(homeserver.spies.getFreshBytes).toHaveBeenCalledTimes(1));
        await Promise.resolve();
        // The second write waits for the first one instead of reading the same copy
        expect(homeserver.spies.getFreshBytes).toHaveBeenCalledTimes(1);

        releaseFirstRead();
        await Promise.all([first, second]);

        expect(putBodies().map((body) => body.status)).toEqual(['away', '🪚building']);
        expect(await stored()).toMatchObject({ status: '🪚building' });
        expect(await UserDetailsModel.findById(owner)).toMatchObject({ status: '🪚building' });
      });

      it('still runs the next write after an earlier one fails', async () => {
        homeserver.spies.getFreshBytes.mockRejectedValueOnce(new Error('Network error'));

        const first = ProfileApplication.commitUpdateStatus({ pubky: owner, status: 'away' });
        const second = ProfileApplication.commitUpdateStatus({ pubky: owner, status: '🪚building' });

        await expect(first).rejects.toThrow('Network error');
        await second;
        expect(putBodies().map((body) => body.status)).toEqual(['🪚building']);
      });
    });

    describe('commitUpdate', () => {
      it('keeps every field the user did not change as published', async () => {
        await UserDetailsModel.create(staleRow);

        await ProfileApplication.commitUpdate({ pubky: owner, changes: { bio: 'New bio' } });

        expect(await stored()).toEqual({ ...published, bio: 'New bio' });
        expect(await UserDetailsModel.findById(owner)).toMatchObject({ ...publishedFields, bio: 'New bio' });
      });

      it('applies deliberate clears', async () => {
        await ProfileApplication.commitUpdate({ pubky: owner, changes: { image: null, bio: '', links: [] } });

        expect(await stored()).toEqual({ ...published, image: null, bio: null, links: null });
        expect(await UserDetailsModel.findById(owner)).toMatchObject({ image: null, bio: '', links: [] });
      });

      it('replaces the links with the edited list', async () => {
        const links = [{ title: 'GITHUB', url: 'https://github.com/example' }];

        await ProfileApplication.commitUpdate({ pubky: owner, changes: { links } });

        expect(await stored()).toEqual({ ...published, links });
      });

      it('refuses an edit outside the profile rules and names the member', async () => {
        await expect(
          ProfileApplication.commitUpdate({ pubky: owner, changes: { links: [{ title: 'FTP', url: 'ftp://x.y' }] } }),
        ).rejects.toMatchObject({
          code: ValidationErrorCode.INVALID_INPUT,
          operation: 'commitUpdate',
          context: { field: 'links[0].url' },
        });

        expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
      });

      it('refuses a deleted profile without writing anything', async () => {
        await homeserver.session.storage.delete(PROFILE_PATH);

        await expect(
          ProfileApplication.commitUpdate({ pubky: owner, changes: { bio: 'New bio' } }),
        ).rejects.toMatchObject({ code: ClientErrorCode.GONE, message: 'Cannot update a deleted profile' });

        expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
      });
    });

    describe('with account deletion', () => {
      const otherFile = `pubky://${owner}/pub/social/v1/posts/0001/0001.json`;
      const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

      beforeEach(async () => {
        await homeserver.session.storage.putJson('/pub/social/v1/posts/0001/0001.json', { content: 'hi' });
        vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
      });

      it('refuses a write requested during the deletion instead of recreating profile.json', async () => {
        let finishDeletingFile!: () => void;
        homeserver.spies.delete.mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              finishDeletingFile = resolve;
            }),
        );

        const deletion = ProfileApplication.commitDelete({ pubky: owner });
        await vi.waitFor(() =>
          expect(homeserver.spies.delete).toHaveBeenCalledWith(otherFile, { singleAttempt: true }),
        );
        const write = ProfileApplication.commitUpdateStatus({ pubky: owner, status: 'back' });
        await settle();
        // The write waits for the deletion instead of reading profile.json while it still exists
        expect(homeserver.spies.getFreshBytes).not.toHaveBeenCalled();

        finishDeletingFile();
        await deletion;

        await expect(write).rejects.toMatchObject({ code: ClientErrorCode.GONE });
        expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
        expect(await homeserver.session.storage.exists(PROFILE_PATH)).toBe(false);
      });

      it('waits for a write already in flight before deleting anything', async () => {
        let finishPut!: () => void;
        const putBlob = homeserver.spies.putBlob.getMockImplementation()!;
        homeserver.spies.putBlob.mockImplementationOnce(
          (params) =>
            new Promise<undefined>((resolve) => {
              finishPut = () => {
                void putBlob(params).then(() => resolve(undefined));
              };
            }),
        );

        const write = ProfileApplication.commitUpdateStatus({ pubky: owner, status: 'back' });
        await vi.waitFor(() => expect(homeserver.spies.putBlob).toHaveBeenCalledOnce());
        const deletion = ProfileApplication.commitDelete({ pubky: owner });
        await settle();
        // Deleting now would let the pending PUT recreate profile.json afterwards
        expect(LocalProfileService.deleteAll).not.toHaveBeenCalled();
        expect(homeserver.spies.listAll).not.toHaveBeenCalled();

        finishPut();
        await Promise.all([write, deletion]);

        expect(await homeserver.session.storage.exists(PROFILE_PATH)).toBe(false);
        expect(await UserDetailsModel.findById(owner)).toMatchObject({ status: 'back' });
      });

      it('takes the same Web Lock for profile writes and deletion', async () => {
        const request = vi.fn((_name: string, task: () => Promise<void>) => task());
        Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });

        try {
          await ProfileApplication.commitUpdateStatus({ pubky: owner, status: 'back' });
          await ProfileApplication.commitDelete({ pubky: owner });
        } finally {
          Reflect.deleteProperty(navigator, 'locks');
        }

        expect(request.mock.calls.map(([name]) => name)).toEqual([
          `pubky-app:profile:${owner}`,
          `pubky-app:profile:${owner}`,
        ]);
      });

      it('passes a write error through the Web Lock unchanged', async () => {
        const request = vi.fn((_name: string, task: () => Promise<void>) => task());
        Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
        await homeserver.session.storage.delete(PROFILE_PATH);

        try {
          await expect(ProfileApplication.commitUpdateStatus({ pubky: owner, status: 'back' })).rejects.toMatchObject({
            code: ClientErrorCode.GONE,
          });
        } finally {
          Reflect.deleteProperty(navigator, 'locks');
        }
      });

      it('turns a Web Lock request that fails on its own into an AppError', async () => {
        const lockError = new DOMException('The document is not fully active.', 'InvalidStateError');
        const request = vi.fn(() => Promise.reject(lockError));
        Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });

        try {
          await expect(ProfileApplication.commitUpdateStatus({ pubky: owner, status: 'back' })).rejects.toMatchObject({
            service: ErrorService.Local,
            operation: 'withProfileLock',
            cause: lockError,
          });
        } finally {
          Reflect.deleteProperty(navigator, 'locks');
        }

        expect(homeserver.spies.getFreshBytes).not.toHaveBeenCalled();
        expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
      });
    });
  });
});
