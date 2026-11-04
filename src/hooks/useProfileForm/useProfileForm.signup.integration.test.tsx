import { act, renderHook } from '@testing-library/react';
import { buildFile, buildUri, decodeObject, toPath } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '@/controllers/auth/auth';
import { FileDetailsModel } from '@/models/file/fileDetails';
import type { Pubky } from '@/models/models.types';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { NexusBootstrapService } from '@/services/nexus/bootstrap/bootstrap';
import { useAuthStore } from '@/stores/auth/auth.store';
import { stubMemoryHomeserver } from '@/test-utils/homeserver';
import { useProfileForm } from './useProfileForm';

vi.mock('next/navigation', () => ({
  usePathname: () => '/test',
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({ useRequireAuth: () => ({ waitForAuth: async () => true }) }));
vi.mock('@/libs/image/stripImageMetadata', () => ({ stripImageMetadata: async (file: File) => file }));
vi.mock('@/molecules/Toaster/toast');

const OWNER = fakeOwner(1) as Pubky;
const BYTES = new Uint8Array([1, 2, 3]);

// Real controllers, applications, data model and IndexedDB on the in-memory homeserver: the order
// a brand-new user's writes reach the homeserver in, which Nexus depends on (a file PUT before the
// first profile PUT is ignored and the avatar stays 404 for good).
describe('useProfileForm signup, through the real write path', () => {
  let homeserver: ReturnType<typeof stubMemoryHomeserver>;
  const avatar = buildFile(OWNER, { bytes: BYTES, type: 'image/png' });
  const profileUrl = buildUri(OWNER, 'user');

  const submitted = () => homeserver.spies.putBlob.mock.calls.map(([{ url }]) => url);
  const renderSignup = () => {
    const { result } = renderHook(() =>
      useProfileForm({ mode: 'create', pubky: OWNER, setShowWelcomeDialog: vi.fn() }),
    );
    act(() => {
      result.current.handlers.setName('Alice');
      result.current.handlers.handleCropComplete(
        new File([BYTES], 'avatar.png', { type: 'image/png' }),
        'blob:preview',
      );
    });
    return result;
  };
  const submit = async (result: ReturnType<typeof renderSignup>) => {
    await act(async () => {
      await result.current.handlers.handleSubmit();
    });
  };

  beforeEach(async () => {
    homeserver = stubMemoryHomeserver(OWNER);
    useAuthStore.setState({ currentUserPubky: OWNER });
    vi.spyOn(AuthController, 'bootstrapWithDelay').mockResolvedValue(undefined);
    vi.spyOn(NexusBootstrapService, 'ingest').mockResolvedValue(undefined);
    await Promise.all([FileDetailsModel.table.clear(), UserDetailsModel.table.clear()]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('PUTs profile.json, naming the avatar, before the avatar file', async () => {
    await submit(renderSignup());

    expect(submitted()).toEqual([profileUrl, avatar.url]);

    const profile = decodeObject(profileUrl, await homeserver.session.storage.getBytes(toPath(profileUrl)), 'user');
    expect(profile.image).toBe(avatar.url);
    await expect(homeserver.session.storage.getBytes(toPath(avatar.url))).resolves.toEqual(BYTES);
    expect((await FileDetailsModel.findById(`${OWNER}:${avatar.id}`))?.name).toBe('avatar.png');
  });

  it('finishes the upload on retry when the first one failed', async () => {
    const put = homeserver.spies.putBlob.getMockImplementation();
    homeserver.spies.putBlob.mockImplementationOnce(async (params) => put?.(params));
    homeserver.spies.putBlob.mockImplementationOnce(async () => {
      throw new Error('offline');
    });
    const result = renderSignup();

    await submit(result);

    await expect(homeserver.session.storage.exists(toPath(profileUrl))).resolves.toBe(true);
    await expect(homeserver.session.storage.exists(toPath(avatar.url))).resolves.toBe(false);
    expect(result.current.state.submitText).toBe('Try again!');

    await submit(result);

    expect(submitted()).toEqual([profileUrl, avatar.url, profileUrl, avatar.url]);
    await expect(homeserver.session.storage.exists(toPath(avatar.url))).resolves.toBe(true);
  });
});
