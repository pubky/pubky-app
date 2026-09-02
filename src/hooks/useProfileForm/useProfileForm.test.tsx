import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_ROUTES, PROFILE_ROUTES } from '@/app/routes';
import { ProfileController } from '@/controllers/profile/profile';
import { toast } from '@/molecules/Toaster/toast';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { useProfileForm } from './useProfileForm';

const routerPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, back: vi.fn() }),
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

vi.mock('@/molecules/Toaster/toast');

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

describe('useProfileForm post-save navigation', () => {
  const userDetails: NexusUserDetails = {
    id: pubky,
    name: 'Valid User',
    bio: '',
    links: [],
    status: null,
    image: null,
    indexed_at: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to the onboarding tags step after a successful create', async () => {
    const { result } = renderHook(() => useProfileForm({ mode: 'create', pubky, setShowWelcomeDialog: vi.fn() }));

    expect(result.current.state.submitText).toBe('Continue');

    act(() => {
      result.current.handlers.setName('Valid User');
    });

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(ProfileController.commitCreate).toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.TAGS);
  });

  it('redirects to the own profile page after a successful edit by default', async () => {
    const { result } = renderHook(() => useProfileForm({ mode: 'edit', pubky, userDetails }));

    await waitFor(() => expect(result.current.state.isLoading).toBe(false));
    expect(result.current.state.submitText).toBe('Save Profile');

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(ProfileController.commitUpdate).toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith(PROFILE_ROUTES.PROFILE);
  });

  it('continues without saving or showing a toast on a pristine onboarding profile revisit', async () => {
    const { result } = renderHook(() =>
      useProfileForm({ mode: 'edit', pubky, userDetails, redirectTo: ONBOARDING_ROUTES.TAGS }),
    );

    await waitFor(() => expect(result.current.state.isLoading).toBe(false));
    expect(result.current.state.submitText).toBe('Continue');

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(ProfileController.commitUpdate).not.toHaveBeenCalled();
    expect(ProfileController.commitCreate).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.TAGS);
  });

  it('saves a dirty onboarding profile revisit before continuing', async () => {
    const { result } = renderHook(() =>
      useProfileForm({ mode: 'edit', pubky, userDetails, redirectTo: ONBOARDING_ROUTES.TAGS }),
    );

    await waitFor(() => expect(result.current.state.isLoading).toBe(false));

    act(() => {
      result.current.handlers.setBio('Updated bio');
    });

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(ProfileController.commitUpdate).toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.TAGS);
  });
});
