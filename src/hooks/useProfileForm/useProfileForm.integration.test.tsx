import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pubky } from '@/models/models.types';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { stubMemoryHomeserver } from '@/test-utils/homeserver';
import { useProfileForm } from './useProfileForm';

vi.mock('next/navigation', () => ({
  usePathname: () => '/test',
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/controllers/auth/auth', () => ({ AuthController: { bootstrapWithDelay: vi.fn() } }));
vi.mock('@/controllers/file/file', () => ({ FileController: { getAvatarUrl: vi.fn() } }));
vi.mock('@/molecules/Toaster/toast');
vi.mock('@/services/nexus/bootstrap/bootstrap', () => ({ NexusBootstrapService: { ingest: vi.fn() } }));

const pubky = fakeOwner(1) as Pubky;
const PROFILE_PATH = '/pub/social/v1/profile.json';
const profile = { name: 'Alice', bio: 'Bio', image: null, status: 'working', links: null };

// The form, the controller, the application, the data model and IndexedDB are real; the
// homeserver is the in-memory one.
describe('useProfileForm published links integration', () => {
  let homeserver: ReturnType<typeof stubMemoryHomeserver>;
  const stored = async () =>
    JSON.parse(new TextDecoder().decode(await homeserver.session.storage.getBytes(PROFILE_PATH)));

  beforeEach(async () => {
    vi.clearAllMocks();
    homeserver = stubMemoryHomeserver(pubky);
    await UserDetailsModel.table.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves a link added on another device when an empty cached placeholder is removed', async () => {
    const publishedLinks = [{ title: 'WEBSITE', url: 'https://example.com/' }];
    await homeserver.session.storage.putBytes(
      PROFILE_PATH,
      new TextEncoder().encode(JSON.stringify({ ...profile, links: publishedLinks, theme: 'dark' })),
    );
    const cached = { ...profile, links: [], id: pubky, indexed_at: 1 };
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

    expect(homeserver.spies.putBlob).toHaveBeenCalledOnce();
    expect(await stored()).toEqual({ ...profile, bio: 'New bio', links: publishedLinks, theme: 'dark' });
    expect(await UserDetailsModel.findById(pubky)).toMatchObject({ bio: 'New bio', links: publishedLinks });
  });

  it('replaces the published links with the ones edited in the form', async () => {
    const published = { ...profile, links: [{ title: 'X (TWITTER)', url: 'https://x.com/alice-old' }] };
    await homeserver.session.storage.putBytes(PROFILE_PATH, new TextEncoder().encode(JSON.stringify(published)));
    const cached = { ...published, id: pubky, indexed_at: 1 };
    const { result } = renderHook(() => useProfileForm({ mode: 'edit', pubky, userDetails: cached }));
    await waitFor(() => expect(result.current.state.isLoading).toBe(false));
    act(() => result.current.handlers.setLinks([{ label: 'X (TWITTER)', url: 'https://x.com/alice' }]));
    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    const editedLinks = [{ title: 'X (TWITTER)', url: 'https://x.com/alice' }];
    expect(homeserver.spies.putBlob).toHaveBeenCalledOnce();
    expect(await stored()).toEqual({ ...published, links: editedLinks });
    expect(await UserDetailsModel.findById(pubky)).toMatchObject({ links: editedLinks });
  });
});

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({ useRequireAuth: () => ({ waitForAuth: async () => true }) }));
