import type { PubkyAppUser } from 'pubky-app-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { UserTtlModel } from '@/models/user/ttl/userTtl';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { asOpaque } from '@/test-utils/type-assertions';

// Avoid pulling WASM-heavy deps from type-only modules
vi.mock('pubky-app-specs', () => ({
  PubkySpecsBuilder: class {
    createUser(name: string, bio?: string, image?: string | null, links?: unknown, status?: string) {
      return {
        user: {
          name,
          bio,
          image,
          links,
          status,
          toJson: () => ({ name, bio, image, links, status }),
        },
        meta: {
          url: 'pubky://test-pubky/pub/pubky.app/profile.json',
        },
      };
    }
  },
  PubkyAppUser: {
    fromJson: (json: { name?: unknown } | undefined) => {
      if (typeof json?.name !== 'string') throw new Error('missing field `name`');
      return json;
    },
  },
  userUriBuilder: (pubky: string) => `pubky://${pubky}/pub/pubky.app/profile.json`,
  getValidMimeTypes: () => ['image/jpeg', 'image/png'],
}));

// Mock HomeserverService methods
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    putBlob: vi.fn(),
    request: vi.fn(),
    getFreshJson: vi.fn(),
  },
}));

// Mock Nexus bootstrap service (fire-and-forget ingest call in commitCreate)
vi.mock('@/services/nexus/bootstrap/bootstrap', () => ({
  NexusBootstrapService: {
    ingest: vi.fn(() => Promise.resolve()),
  },
}));

// Mock auth store used by application layer
let mockAuthState: { setCurrentUserPubky: ReturnType<typeof vi.fn>; setHasProfile: ReturnType<typeof vi.fn> };
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: {
    getState: vi.fn(() => mockAuthState),
  },
}));

let ProfileApplication: typeof import('./profile').ProfileApplication;
let NexusBootstrapService: typeof import('@/services/nexus/bootstrap/bootstrap').NexusBootstrapService;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();

  mockAuthState = {
    setCurrentUserPubky: vi.fn(),
    setHasProfile: vi.fn(),
  };

  // Re-import after resetModules
  ({ ProfileApplication } = await import('./profile'));
  ({ NexusBootstrapService } = await import('@/services/nexus/bootstrap/bootstrap'));

  await UserDetailsModel.table.clear();

  // Mock Logger to prevent AppError from logging during tests
  vi.spyOn(Logger, 'error').mockImplementation(() => {});
  vi.spyOn(Logger, 'warn').mockImplementation(() => {});
  vi.spyOn(Logger, 'info').mockImplementation(() => {});
  vi.spyOn(Logger, 'debug').mockImplementation(() => {});
});

describe('ProfileApplication', () => {
  describe('commitCreate', () => {
    it('creates profile and sets auth state on success', async () => {
      const profileJson = {
        name: 'Alice',
        bio: 'Alice bio',
        image: null,
        links: [{ title: 'Website', url: 'https://example.com' }],
        status: '',
      };
      const profile = asOpaque<PubkyAppUser>({ ...profileJson, toJson: vi.fn(() => profileJson) });
      const url = 'pubky://user/pub/pubky.app/user';
      const pubky = 'test-pubky' as Pubky;

      const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

      await ProfileApplication.commitCreate({ profile, url, pubky });

      expect(profile.toJson).toHaveBeenCalledTimes(1);
      expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.PUT, url, bodyJson: profileJson });
      expect(NexusBootstrapService.ingest).toHaveBeenCalledWith(pubky);
      expect(mockAuthState.setCurrentUserPubky).toHaveBeenCalledWith(pubky);
      expect(mockAuthState.setHasProfile).toHaveBeenCalledWith(true);

      const localProfile = await UserDetailsModel.findById(pubky);
      expect(localProfile).toMatchObject({
        id: pubky,
        name: profileJson.name,
        bio: profileJson.bio,
        image: profileJson.image,
        links: profileJson.links,
        status: null,
        localUpdatedAt: expect.any(Number),
      });
      expect(localProfile?.nexusIndexedAt).toBeUndefined();
      expect(await UserTtlModel.findById(pubky)).toMatchObject({ lastUpdatedAt: localProfile?.localUpdatedAt });
    });

    it('does not persist the local profile when the homeserver write fails', async () => {
      const profileJson = { name: 'Bob', bio: '', image: null, links: [], status: '' };
      const profile = asOpaque<PubkyAppUser>({ ...profileJson, toJson: vi.fn(() => profileJson) });
      const url = 'pubky://user/pub/pubky.app/user';
      const pubky = 'test-pubky' as Pubky;

      vi.spyOn(HomeserverService, 'request').mockRejectedValue(new Error('create failed'));

      await expect(ProfileApplication.commitCreate({ profile, url, pubky })).rejects.toThrow('create failed');

      // Auth state should not be modified on error (see TODO in profile.ts)
      expect(mockAuthState.setHasProfile).not.toHaveBeenCalled();
      expect(mockAuthState.setCurrentUserPubky).not.toHaveBeenCalled();
      // Ingest only fires after profile.json is actually saved
      expect(NexusBootstrapService.ingest).not.toHaveBeenCalled();

      const localProfile = await UserDetailsModel.findById(pubky);
      expect(localProfile).toBeNull();
    });
  });

  describe('writes on top of the published profile', () => {
    const testPubky = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky;
    const profileUrl = `pubky://${testPubky}/pub/pubky.app/profile.json`;
    const published = {
      name: 'Test User',
      bio: 'Test bio',
      image: `pubky://${testPubky}/pub/pubky.app/files/NEW`,
      links: [{ title: 'WEBSITE', url: 'https://example.com/' }],
      status: 'working',
    };
    // A cached row that predates the last avatar change
    const staleRow = {
      id: testPubky,
      ...published,
      image: `pubky://${testPubky}/pub/pubky.app/files/OLD`,
      status: 'available',
      indexed_at: 1_000,
      nexusIndexedAt: 1_000,
    };

    const putCalls = () => vi.mocked(HomeserverService.request).mock.calls;

    const notFound = async () => {
      // Built via dynamic import so the AppError comes from the same module graph as the
      // re-imported ProfileApplication (`vi.resetModules()` would otherwise break `instanceof`).
      const { Err } = await import('@/libs/error/error.factories');
      return Err.client(ClientErrorCode.NOT_FOUND, 'Not found', {
        service: ErrorService.Homeserver,
        operation: 'getFreshJson',
        context: { statusCode: HttpStatusCode.NOT_FOUND },
      });
    };

    beforeEach(async () => {
      await UserDetailsModel.table.clear();
      await UserTtlModel.table.clear();
      vi.mocked(HomeserverService.getFreshJson).mockResolvedValue(published);
      vi.mocked(HomeserverService.request).mockResolvedValue(undefined);
    });

    describe('commitUpdateStatus', () => {
      it('publishes the homeserver profile with only the new status, even when the cached row is stale', async () => {
        await UserDetailsModel.create(staleRow);

        await ProfileApplication.commitUpdateStatus({ pubky: testPubky, status: '🪚building' });

        expect(HomeserverService.getFreshJson).toHaveBeenCalledWith(profileUrl);
        expect(putCalls()).toEqual([
          [
            {
              method: HttpMethod.PUT,
              url: 'pubky://test-pubky/pub/pubky.app/profile.json',
              bodyJson: { ...published, status: '🪚building' },
            },
          ],
        ]);
      });

      it('stores exactly the published profile as a pending local edit', async () => {
        await UserDetailsModel.create(staleRow);

        await ProfileApplication.commitUpdateStatus({ pubky: testPubky, status: '🪚building' });

        const row = await UserDetailsModel.findById(testPubky);
        expect(row).toMatchObject({ ...published, status: '🪚building', nexusIndexedAt: 1_000, deleted: false });
        expect(row?.localUpdatedAt).toEqual(expect.any(Number));
        expect(await UserTtlModel.findById(testPubky)).toMatchObject({ lastUpdatedAt: row?.localUpdatedAt });
      });

      it('creates the local row when it is missing', async () => {
        await ProfileApplication.commitUpdateStatus({ pubky: testPubky, status: '🪚building' });

        const row = await UserDetailsModel.findById(testPubky);
        expect(row).toMatchObject({ id: testPubky, ...published, status: '🪚building' });
        expect(row?.localUpdatedAt).toEqual(expect.any(Number));
        expect(await UserTtlModel.findById(testPubky)).toMatchObject({ lastUpdatedAt: row?.localUpdatedAt });
      });

      it('clears the status', async () => {
        await ProfileApplication.commitUpdateStatus({ pubky: testPubky, status: '' });

        expect(putCalls()[0]?.[0].bodyJson).toEqual({ ...published, status: undefined });
        expect((await UserDetailsModel.findById(testPubky))?.status).toBeNull();
      });

      it('clears a cached tombstone after the status is written', async () => {
        await UserDetailsModel.create({ ...staleRow, deleted: true });

        await ProfileApplication.commitUpdateStatus({ pubky: testPubky, status: 'back' });

        expect((await UserDetailsModel.findById(testPubky))?.deleted).toBe(false);
      });

      it('refuses a deleted profile without writing anything', async () => {
        await UserDetailsModel.create(staleRow);
        vi.mocked(HomeserverService.getFreshJson).mockRejectedValue(await notFound());

        await expect(ProfileApplication.commitUpdateStatus({ pubky: testPubky, status: 'back' })).rejects.toMatchObject(
          {
            code: ClientErrorCode.GONE,
            message: 'Cannot update the status of a deleted profile',
          },
        );

        expect(putCalls()).toHaveLength(0);
        expect(await UserDetailsModel.findById(testPubky)).toMatchObject({ status: 'available' });
      });

      it('writes nothing when the homeserver read fails', async () => {
        await UserDetailsModel.create(staleRow);
        vi.mocked(HomeserverService.getFreshJson).mockRejectedValue(new Error('Network error'));

        await expect(ProfileApplication.commitUpdateStatus({ pubky: testPubky, status: 'back' })).rejects.toThrow(
          'Network error',
        );

        expect(putCalls()).toHaveLength(0);
        expect(await UserDetailsModel.findById(testPubky)).toMatchObject({ status: 'available' });
      });

      it('writes nothing when the published profile is unreadable', async () => {
        vi.mocked(HomeserverService.getFreshJson).mockResolvedValue(undefined);

        await expect(ProfileApplication.commitUpdateStatus({ pubky: testPubky, status: 'back' })).rejects.toMatchObject(
          {
            code: ValidationErrorCode.INVALID_INPUT,
          },
        );

        expect(putCalls()).toHaveLength(0);
      });

      it('keeps the local row when the homeserver write fails', async () => {
        await UserDetailsModel.create(staleRow);
        vi.mocked(HomeserverService.request).mockRejectedValue(new Error('Network error'));

        await expect(ProfileApplication.commitUpdateStatus({ pubky: testPubky, status: 'back' })).rejects.toThrow(
          'Network error',
        );

        expect(await UserDetailsModel.findById(testPubky)).toMatchObject({ status: 'available' });
      });

      it('runs overlapping writes one at a time, so the later action lands last', async () => {
        let releaseFirstRead!: () => void;
        vi.mocked(HomeserverService.getFreshJson).mockReturnValueOnce(
          new Promise((resolve) => {
            releaseFirstRead = () => resolve(published);
          }),
        );

        const first = ProfileApplication.commitUpdateStatus({ pubky: testPubky, status: 'away' });
        const second = ProfileApplication.commitUpdateStatus({ pubky: testPubky, status: '🪚building' });
        await vi.waitFor(() => expect(HomeserverService.getFreshJson).toHaveBeenCalledTimes(1));
        await Promise.resolve();
        // The second write waits for the first one instead of reading the same copy
        expect(HomeserverService.getFreshJson).toHaveBeenCalledTimes(1);

        releaseFirstRead();
        await Promise.all([first, second]);

        expect(putCalls().map(([params]) => params.bodyJson?.status)).toEqual(['away', '🪚building']);
        expect(await UserDetailsModel.findById(testPubky)).toMatchObject({ status: '🪚building' });
      });

      it('still runs the next write after an earlier one fails', async () => {
        vi.mocked(HomeserverService.getFreshJson).mockRejectedValueOnce(new Error('Network error'));

        const first = ProfileApplication.commitUpdateStatus({ pubky: testPubky, status: 'away' });
        const second = ProfileApplication.commitUpdateStatus({ pubky: testPubky, status: '🪚building' });

        await expect(first).rejects.toThrow('Network error');
        await second;
        expect(putCalls().map(([params]) => params.bodyJson?.status)).toEqual(['🪚building']);
      });
    });

    describe('commitUpdate', () => {
      it('keeps every field the user did not change as published', async () => {
        await UserDetailsModel.create(staleRow);

        await ProfileApplication.commitUpdate({ pubky: testPubky, changes: { bio: 'New bio' } });

        expect(putCalls()[0]?.[0].bodyJson).toEqual({ ...published, bio: 'New bio' });
        expect(await UserDetailsModel.findById(testPubky)).toMatchObject({ ...published, bio: 'New bio' });
      });

      it('applies deliberate clears', async () => {
        await ProfileApplication.commitUpdate({ pubky: testPubky, changes: { image: null, bio: '', links: [] } });

        expect(putCalls()[0]?.[0].bodyJson).toEqual({ ...published, image: null, bio: '', links: [] });
      });

      it('refuses a deleted profile without writing anything', async () => {
        vi.mocked(HomeserverService.getFreshJson).mockRejectedValue(await notFound());

        await expect(
          ProfileApplication.commitUpdate({ pubky: testPubky, changes: { bio: 'New bio' } }),
        ).rejects.toMatchObject({ code: ClientErrorCode.GONE, message: 'Cannot update a deleted profile' });

        expect(putCalls()).toHaveLength(0);
      });
    });
  });
});
