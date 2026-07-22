import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileController } from '@/controllers/profile/profile';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { useProfileForm } from './useProfileForm';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/controllers/auth/auth', () => ({
  AuthController: { bootstrapWithDelay: vi.fn() },
}));

vi.mock('@/controllers/file/file', () => ({
  FileController: { commitCreate: vi.fn(), getAvatarUrl: vi.fn() },
}));

vi.mock('@/controllers/profile/profile', () => ({
  ProfileController: { commitCreate: vi.fn(), commitUpdate: vi.fn() },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: { getState: () => ({ setProfile: vi.fn() }) },
}));

const pubky = 'test-pubky';
const unsafeLink = { label: 'Website', url: 'javascript:alert(1)' };

describe('useProfileForm profile link safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks an unsafe link from the create-profile submission path', async () => {
    const { result } = renderHook(() => useProfileForm({ mode: 'create', pubky, setShowWelcomeDialog: vi.fn() }));

    act(() => {
      result.current.handlers.setName('Valid User');
      result.current.handlers.setLinks([unsafeLink]);
      result.current.handlers.validateLinkUrl(unsafeLink.url, 0);
    });

    expect(result.current.errors.linkUrlErrors[0]).toBe('Invalid URL');

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(ProfileController.commitCreate).not.toHaveBeenCalled();
  });

  it('blocks an unsafe legacy link from the edit-profile submission path', async () => {
    const userDetails: NexusUserDetails = {
      id: pubky,
      name: 'Valid User',
      bio: '',
      links: [{ title: unsafeLink.label, url: unsafeLink.url }],
      status: null,
      image: null,
      indexed_at: 1,
    };
    const { result } = renderHook(() => useProfileForm({ mode: 'edit', pubky, userDetails }));

    await waitFor(() => expect(result.current.state.isLoading).toBe(false));

    act(() => {
      result.current.handlers.validateLinkUrl(unsafeLink.url, 0);
    });

    expect(result.current.errors.linkUrlErrors[0]).toBe('Invalid URL');

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(ProfileController.commitUpdate).not.toHaveBeenCalled();
  });
});
