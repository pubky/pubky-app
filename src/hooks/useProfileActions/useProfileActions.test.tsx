import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { showErrorToast } from '@/molecules/Toaster/showErrorToast';

import { useProfileActions } from './useProfileActions';
import { ErrorMessages } from '@/libs/error/error.messages';
import { Logger } from '@/libs/logger/logger';
import { ProfileController } from '@/controllers/profile/profile';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { Pubky } from '@/models/models.types';
// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/molecules/Toaster/showErrorToast', () => ({
  showErrorToast: vi.fn(),
}));

// Mock AuthController.logout
const mockLogout = vi.fn();
vi.mock('@/controllers/auth/auth', () => ({
  AuthController: {
    logout: () => mockLogout(),
  },
}));

// Mock useCopyToClipboard hook
const mockCopyToClipboard = vi.fn();

vi.mock('@/hooks/useCopyToClipboard/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({
    copyToClipboard: mockCopyToClipboard,
  }),
}));

describe('useProfileActions', () => {
  const defaultProps = {
    publicKey: 'pubkytest-user-id',
    link: 'https://example.com/profile/test-user-id',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger, 'error').mockImplementation(() => {});
    vi.mocked(showErrorToast).mockImplementation(() => {});
    useAuthStore.setState({ currentUserPubky: null });
  });

  describe('Action handlers', () => {
    it('returns all action handlers', () => {
      const { result } = renderHook(() => useProfileActions(defaultProps));

      expect(result.current.onEdit).toBeDefined();
      expect(result.current.onCopyPublicKey).toBeDefined();
      expect(result.current.onCopyLink).toBeDefined();
      expect(result.current.onSignOut).toBeDefined();
      expect(result.current.onStatusChange).toBeDefined();

      expect(typeof result.current.onEdit).toBe('function');
      expect(typeof result.current.onCopyPublicKey).toBe('function');
      expect(typeof result.current.onCopyLink).toBe('function');
      expect(typeof result.current.onSignOut).toBe('function');
      expect(typeof result.current.onStatusChange).toBe('function');
    });
  });

  describe('onCopyPublicKey', () => {
    it('calls copyToClipboard with public key', () => {
      const { result } = renderHook(() => useProfileActions(defaultProps));

      result.current.onCopyPublicKey();

      expect(mockCopyToClipboard).toHaveBeenCalledWith('pubkytest-user-id');
      expect(mockCopyToClipboard).toHaveBeenCalledTimes(1);
    });

    it('uses provided public key from props', () => {
      const customProps = {
        publicKey: 'pubkycustom-user',
        link: 'https://example.com/profile/custom-user',
      };

      const { result } = renderHook(() => useProfileActions(customProps));

      result.current.onCopyPublicKey();

      expect(mockCopyToClipboard).toHaveBeenCalledWith('pubkycustom-user');
    });

    it('handles empty public key', () => {
      const emptyProps = {
        publicKey: '',
        link: 'https://example.com/profile/test',
      };

      const { result } = renderHook(() => useProfileActions(emptyProps));

      result.current.onCopyPublicKey();

      expect(mockCopyToClipboard).toHaveBeenCalledWith('');
    });
  });

  describe('onCopyLink', () => {
    it('calls copyToClipboard with profile link', () => {
      const { result } = renderHook(() => useProfileActions(defaultProps));

      result.current.onCopyLink();

      expect(mockCopyToClipboard).toHaveBeenCalledWith('https://example.com/profile/test-user-id');
      expect(mockCopyToClipboard).toHaveBeenCalledTimes(1);
    });

    it('uses provided link from props', () => {
      const customProps = {
        publicKey: 'pubkycustom-user',
        link: 'https://custom-domain.com/user/custom-user',
      };

      const { result } = renderHook(() => useProfileActions(customProps));

      result.current.onCopyLink();

      expect(mockCopyToClipboard).toHaveBeenCalledWith('https://custom-domain.com/user/custom-user');
    });

    it('handles empty link', () => {
      const emptyProps = {
        publicKey: 'pubkytest',
        link: '',
      };

      const { result } = renderHook(() => useProfileActions(emptyProps));

      result.current.onCopyLink();

      expect(mockCopyToClipboard).toHaveBeenCalledWith('');
    });
  });

  describe('onSignOut', () => {
    it('calls logout and navigates to logout route', async () => {
      mockLogout.mockResolvedValue(undefined);
      const { result } = renderHook(() => useProfileActions(defaultProps));

      await act(async () => {
        await result.current.onSignOut();
      });

      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/logout');
      expect(mockPush).toHaveBeenCalledTimes(1);
    });

    it('sets isLoggingOut to true during logout', async () => {
      let resolveLogout: (value?: unknown) => void;
      mockLogout.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveLogout = resolve;
          }),
      );
      const { result } = renderHook(() => useProfileActions(defaultProps));

      expect(result.current.isLoggingOut).toBe(false);

      // Start the logout process (don't await, we want to check loading state)
      const signOutPromise = result.current.onSignOut();

      // Verify isLoggingOut is true during the process
      await waitFor(() => {
        expect(result.current.isLoggingOut).toBe(true);
      });

      // Complete the logout and wait for the promise to finish
      await act(async () => {
        resolveLogout();
        await signOutPromise;
      });
    });

    it('handles logout error gracefully', async () => {
      mockLogout.mockRejectedValue(new Error('Logout failed'));
      const { result } = renderHook(() => useProfileActions(defaultProps));

      await act(async () => {
        await result.current.onSignOut();
      });

      expect(Logger.error).toHaveBeenCalledWith('Failed to logout:', expect.any(Error));
      expect(showErrorToast).toHaveBeenCalledWith({
        description: ErrorMessages.LOGOUT_FAILED,
      });
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('onEdit', () => {
    it('navigates to settings edit route', () => {
      const { result } = renderHook(() => useProfileActions(defaultProps));

      result.current.onEdit();

      expect(mockPush).toHaveBeenCalledWith('/settings/edit');
      expect(mockPush).toHaveBeenCalledTimes(1);
    });
  });

  describe('onStatusChange', () => {
    it('calls ProfileController.commitUpdateStatus with status', async () => {
      const mockUpdateStatus = vi.spyOn(ProfileController, 'commitUpdateStatus').mockResolvedValue(undefined);
      useAuthStore.setState({ currentUserPubky: 'test-user' as Pubky });

      const { result } = renderHook(() => useProfileActions(defaultProps));

      await result.current.onStatusChange('available');

      expect(mockUpdateStatus).toHaveBeenCalledWith({ pubky: 'test-user', status: 'available' });
      expect(mockUpdateStatus).toHaveBeenCalledTimes(1);

      mockUpdateStatus.mockRestore();
    });
  });

  describe('Memoization', () => {
    it('memoizes action handlers based on dependencies', () => {
      const { result, rerender } = renderHook(({ publicKey, link }) => useProfileActions({ publicKey, link }), {
        initialProps: defaultProps,
      });

      const firstOnCopyPublicKey = result.current.onCopyPublicKey;
      const firstOnCopyLink = result.current.onCopyLink;

      // Rerender with same props
      rerender(defaultProps);

      expect(result.current.onCopyPublicKey).toBe(firstOnCopyPublicKey);
      expect(result.current.onCopyLink).toBe(firstOnCopyLink);
    });

    it('updates handlers when publicKey changes', () => {
      const { result, rerender } = renderHook(({ publicKey, link }) => useProfileActions({ publicKey, link }), {
        initialProps: defaultProps,
      });

      const firstOnCopyPublicKey = result.current.onCopyPublicKey;

      // Rerender with different publicKey
      rerender({
        publicKey: 'pubkynew-user',
        link: defaultProps.link,
      });

      expect(result.current.onCopyPublicKey).not.toBe(firstOnCopyPublicKey);

      // Call the new handler to verify it uses the new publicKey
      result.current.onCopyPublicKey();
      expect(mockCopyToClipboard).toHaveBeenCalledWith('pubkynew-user');
    });

    it('updates handlers when link changes', () => {
      const { result, rerender } = renderHook(({ publicKey, link }) => useProfileActions({ publicKey, link }), {
        initialProps: defaultProps,
      });

      const firstOnCopyLink = result.current.onCopyLink;

      // Rerender with different link
      rerender({
        publicKey: defaultProps.publicKey,
        link: 'https://new-link.com/profile/user',
      });

      expect(result.current.onCopyLink).not.toBe(firstOnCopyLink);

      // Call the new handler to verify it uses the new link
      result.current.onCopyLink();
      expect(mockCopyToClipboard).toHaveBeenCalledWith('https://new-link.com/profile/user');
    });

    it('handlers change correctly when props update', () => {
      const { result, rerender } = renderHook(({ publicKey, link }) => useProfileActions({ publicKey, link }), {
        initialProps: defaultProps,
      });

      const firstOnCopyPublicKey = result.current.onCopyPublicKey;
      const firstOnCopyLink = result.current.onCopyLink;

      // Rerender with different props
      rerender({
        publicKey: 'pubkynew-user',
        link: 'https://new-link.com',
      });

      // onCopyPublicKey and onCopyLink depend on props, so they should change
      expect(result.current.onCopyPublicKey).not.toBe(firstOnCopyPublicKey);
      expect(result.current.onCopyLink).not.toBe(firstOnCopyLink);
    });
  });

  describe('Multiple calls', () => {
    it('handles multiple onCopyPublicKey calls', () => {
      const { result } = renderHook(() => useProfileActions(defaultProps));

      result.current.onCopyPublicKey();
      result.current.onCopyPublicKey();
      result.current.onCopyPublicKey();

      expect(mockCopyToClipboard).toHaveBeenCalledTimes(3);
      expect(mockCopyToClipboard).toHaveBeenCalledWith('pubkytest-user-id');
    });

    it('handles multiple onCopyLink calls', () => {
      const { result } = renderHook(() => useProfileActions(defaultProps));

      result.current.onCopyLink();
      result.current.onCopyLink();

      expect(mockCopyToClipboard).toHaveBeenCalledTimes(2);
      expect(mockCopyToClipboard).toHaveBeenCalledWith('https://example.com/profile/test-user-id');
    });

    it('handles multiple onSignOut calls', async () => {
      mockLogout.mockResolvedValue(undefined);
      const { result } = renderHook(() => useProfileActions(defaultProps));

      await act(async () => {
        await result.current.onSignOut();
        await result.current.onSignOut();
      });

      expect(mockLogout).toHaveBeenCalledTimes(2);
      expect(mockPush).toHaveBeenCalledTimes(2);
      expect(mockPush).toHaveBeenCalledWith('/logout');
    });
  });
});
