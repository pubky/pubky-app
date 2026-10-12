import { act, renderHook, waitFor } from '@testing-library/react';
import { decodeObject, parsePubkyUrl } from 'pubky-social-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useProfileForm } from './useProfileForm';

vi.mock('next/navigation', () => ({
  usePathname: () => '/test',
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/controllers/auth/auth', () => ({ AuthController: { bootstrapWithDelay: vi.fn() } }));
vi.mock('@/controllers/file/file', () => ({ FileController: { getAvatarUrl: vi.fn() } }));
vi.mock('@/molecules/Toaster/toast');
vi.mock('@/services/homeserver/homeserver', () => ({
  // An account whose only profile is the 0.x one: the edit writes its first v1 profile
  HomeserverService: {
    getFreshJson: vi.fn(),
    getFreshBytes: vi.fn(async () => null),
    putBlob: vi.fn(),
    createWriteFence: () => ({ enter: () => {}, assertCurrent: () => {} }),
  },
}));
vi.mock('@/services/nexus/bootstrap/bootstrap', () => ({ NexusBootstrapService: { ingest: vi.fn() } }));

const pubky = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y';
const profile = { name: 'Alice', bio: 'Bio', image: null, status: 'working', links: [] };
const v1ProfileUrl = `pubky://${pubky}/pub/social/v1/profile.json`;

/** The profile the edit PUT, decoded. */
const putProfile = () => {
  const [{ url, blob }] = vi.mocked(HomeserverService.putBlob).mock.calls[0];
  return { url, profile: decodeObject(parsePubkyUrl(url), blob, 'user') };
};

describe('useProfileForm published links integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(HomeserverService.getFreshBytes).mockResolvedValue(null);
  });

  it('preserves a link added on another device when an empty cached placeholder is removed', async () => {
    const publishedLinks = [{ title: 'WEBSITE', url: 'https://example.com/' }];
    vi.mocked(HomeserverService.getFreshJson).mockResolvedValue({ ...profile, links: publishedLinks });
    const cached = { ...profile, id: pubky, indexed_at: 1 };
    await UserDetailsModel.upsert(cached);
    const { result } = renderHook(() => useProfileForm({ mode: 'edit', pubky, userDetails: cached }));
    await waitFor(() => expect(result.current.state.isLoading).toBe(false));
    act(() => {
      result.current.handlers.handleDeleteLink(1);
      result.current.handlers.setBio('New bio');
    });
    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(HomeserverService.putBlob).toHaveBeenCalledOnce();
    expect(putProfile()).toEqual({
      url: v1ProfileUrl,
      profile: { ...profile, bio: 'New bio', links: publishedLinks },
    });
    expect(await UserDetailsModel.findById(pubky)).toMatchObject({ bio: 'New bio', links: publishedLinks });
  });

  it('repairs a published bare X handle through the form, merge and SDK validation', async () => {
    const published = { ...profile, links: [{ title: 'X (TWITTER)', url: '@alice' }] };
    vi.mocked(HomeserverService.getFreshJson).mockResolvedValue(published);
    const cached = { ...published, id: pubky, indexed_at: 1 };
    const { result } = renderHook(() => useProfileForm({ mode: 'edit', pubky, userDetails: cached }));
    await waitFor(() => expect(result.current.state.isLoading).toBe(false));
    act(() => result.current.handlers.setLinks([{ label: 'X (TWITTER)', url: 'https://x.com/alice' }]));
    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    const repairedLinks = [{ title: 'X (TWITTER)', url: 'https://x.com/alice' }];
    expect(HomeserverService.putBlob).toHaveBeenCalledOnce();
    expect(putProfile()).toEqual({ url: v1ProfileUrl, profile: { ...published, links: repairedLinks } });
    expect(await UserDetailsModel.findById(pubky)).toMatchObject({ links: repairedLinks });
  });
});

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({ useRequireAuth: () => ({ waitForAuth: async () => true }) }));
