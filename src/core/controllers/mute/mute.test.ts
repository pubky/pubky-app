import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MuteApplication } from '@/application/mute/mute';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import { MuteNormalizer } from '@/pipes/mute/mute.normalizer';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockSession } from '@/test-utils/pubky';
import { withFrozenSpecClock } from '@/test-utils/spec-clock';
import { MuteController } from './mute';

const MUTER = fakeOwner(1);
const MUTEE = fakeOwner(2);

describe('MuteController', () => {
  withFrozenSpecClock();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('commitMute', () => {
    it('builds the v1 mute and delegates a PUT with its URL and bytes', async () => {
      const built = MuteNormalizer.to({ muter: MUTER, mutee: MUTEE });
      const toSpy = vi.spyOn(MuteNormalizer, 'to');
      const commitMuteSpy = vi.spyOn(MuteApplication, 'commitMute').mockResolvedValue(undefined);

      await MuteController.commitMute(HttpMethod.PUT, { muter: MUTER, mutee: MUTEE });

      expect(toSpy).toHaveBeenCalledWith(expect.objectContaining({ muter: MUTER, mutee: MUTEE }));
      expect(commitMuteSpy).toHaveBeenCalledWith({
        eventType: HttpMethod.PUT,
        muteUrl: built.url,
        muteBody: built.body,
        muter: MUTER,
        mutee: MUTEE,
        isCurrent: expect.any(Function),
      });
    });

    it('delegates a DELETE with both copies to delete and builds no mute', async () => {
      const toSpy = vi.spyOn(MuteNormalizer, 'to');
      const commitMuteSpy = vi.spyOn(MuteApplication, 'commitMute').mockResolvedValue(undefined);

      await MuteController.commitMute(HttpMethod.DELETE, { muter: MUTER, mutee: MUTEE });

      expect(toSpy).not.toHaveBeenCalled();
      expect(commitMuteSpy).toHaveBeenCalledWith({
        eventType: HttpMethod.DELETE,
        deleteUrls: MuteNormalizer.toDeleteUrls({ muter: MUTER, mutee: MUTEE }),
        muter: MUTER,
        mutee: MUTEE,
        isCurrent: expect.any(Function),
      });
    });

    it('hands the application a session guard that expires on logout and same-account re-login', async () => {
      useAuthStore.setState({ currentUserPubky: MUTER, session: mockSession() });
      const commitMuteSpy = vi.spyOn(MuteApplication, 'commitMute').mockResolvedValue(undefined);

      await MuteController.commitMute(HttpMethod.PUT, { muter: MUTER, mutee: MUTEE });

      const isCurrent = commitMuteSpy.mock.calls[0][0].isCurrent!;
      expect(isCurrent()).toBe(true);
      useAuthStore.setState({ currentUserPubky: null, session: null });
      expect(isCurrent()).toBe(false);
      useAuthStore.setState({ currentUserPubky: MUTER, session: mockSession() });
      expect(isCurrent()).toBe(false);
    });

    it.each([HttpMethod.PUT, HttpMethod.DELETE] as const)(
      'strips the mutee prefix before normalizing and delegating a %s',
      async (eventType) => {
        const toSpy = vi.spyOn(MuteNormalizer, 'to');
        const deleteUrlsSpy = vi.spyOn(MuteNormalizer, 'toDeleteUrls');
        const commitMuteSpy = vi.spyOn(MuteApplication, 'commitMute').mockResolvedValue(undefined);

        await MuteController.commitMute(eventType, { muter: MUTER, mutee: `pubky${MUTEE}` as Pubky });

        const normalize = eventType === HttpMethod.PUT ? toSpy : deleteUrlsSpy;
        expect(normalize).toHaveBeenCalledWith(expect.objectContaining({ muter: MUTER, mutee: MUTEE }));
        expect(commitMuteSpy).toHaveBeenCalledWith(expect.objectContaining({ eventType, mutee: MUTEE }));
      },
    );

    it('bubbles when MuteNormalizer.to fails and does not delegate', async () => {
      vi.spyOn(MuteNormalizer, 'to').mockImplementation(() => {
        throw new Error('normalize-fail');
      });
      const commitMuteSpy = vi.spyOn(MuteApplication, 'commitMute').mockResolvedValue(undefined);

      await expect(MuteController.commitMute(HttpMethod.PUT, { muter: MUTER, mutee: MUTEE })).rejects.toThrow(
        'normalize-fail',
      );

      expect(commitMuteSpy).not.toHaveBeenCalled();
    });

    it('bubbles when MuteApplication.commitMute fails', async () => {
      vi.spyOn(MuteApplication, 'commitMute').mockRejectedValue(new Error('commit-fail'));

      await expect(MuteController.commitMute(HttpMethod.PUT, { muter: MUTER, mutee: MUTEE })).rejects.toThrow(
        'commit-fail',
      );
    });
  });

  describe('fetchMutedUsers', () => {
    it('should delegate to MuteApplication.fetchMutedUsers', async () => {
      const mockMutedUsers: Pubky[] = ['muted-1' as Pubky, 'muted-2' as Pubky];

      const fetchSpy = vi.spyOn(MuteApplication, 'fetchMutedUsers').mockResolvedValue(mockMutedUsers);

      const result = await MuteController.fetchMutedUsers(MUTER);

      expect(result).toEqual(mockMutedUsers);
      expect(fetchSpy).toHaveBeenCalledWith(MUTER, { isCurrent: expect.any(Function) });
    });

    it('passes a guard that expires when the session ends', async () => {
      useAuthStore.getState().init({ session: mockSession(), currentUserPubky: MUTER, hasProfile: true });
      const fetchSpy = vi.spyOn(MuteApplication, 'fetchMutedUsers').mockResolvedValue([]);

      await MuteController.fetchMutedUsers(MUTER);
      const { isCurrent } = fetchSpy.mock.calls[0][1] as { isCurrent: () => boolean };

      expect(isCurrent()).toBe(true);
      useAuthStore.getState().reset();
      expect(isCurrent()).toBe(false);
    });

    it('should propagate errors from application layer', async () => {
      vi.spyOn(MuteApplication, 'fetchMutedUsers').mockRejectedValue(new Error('fetch-fail'));

      await expect(MuteController.fetchMutedUsers(MUTER)).rejects.toThrow('fetch-fail');
    });
  });
});
