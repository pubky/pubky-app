import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpMethod } from '@/libs/http/http.types';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useProfileForm } from './useProfileForm';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/controllers/auth/auth', () => ({ AuthController: { bootstrapWithDelay: vi.fn() } }));
vi.mock('@/controllers/file/file', () => ({ FileController: { getAvatarUrl: vi.fn() } }));
vi.mock('@/molecules/Toaster/toast');
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: { getFreshJson: vi.fn(), request: vi.fn() },
}));
vi.mock('@/services/nexus/bootstrap/bootstrap', () => ({ NexusBootstrapService: { ingest: vi.fn() } }));

const pubky = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y';
const profile = { name: 'Alice', bio: 'Bio', image: null, status: 'working', links: [] };

describe('useProfileForm published links integration', () => {
  beforeEach(() => vi.clearAllMocks());

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

    expect(HomeserverService.request).toHaveBeenCalledExactlyOnceWith({
      method: HttpMethod.PUT,
      url: `pubky://${pubky}/pub/pubky.app/profile.json`,
      bodyJson: { ...profile, image: undefined, bio: 'New bio', links: publishedLinks },
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
    expect(HomeserverService.request).toHaveBeenCalledExactlyOnceWith({
      method: HttpMethod.PUT,
      url: `pubky://${pubky}/pub/pubky.app/profile.json`,
      bodyJson: { ...published, image: undefined, links: repairedLinks },
    });
    expect(await UserDetailsModel.findById(pubky)).toMatchObject({ links: repairedLinks });
  });
});
