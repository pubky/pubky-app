import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileController } from '@/controllers/profile/profile';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useProfileActions } from './useProfileActions';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
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
    it('navigates to the logout route without waiting for session cleanup', () => {
      const { result } = renderHook(() => useProfileActions(defaultProps));

      act(() => {
        result.current.onSignOut();
      });

      expect(mockPush).toHaveBeenCalledWith('/logout');
      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockLogout).not.toHaveBeenCalled();
      expect(result.current.isLoggingOut).toBe(true);
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

    it('handles multiple onSignOut calls', () => {
      const { result } = renderHook(() => useProfileActions(defaultProps));

      act(() => {
        result.current.onSignOut();
        result.current.onSignOut();
      });

      expect(mockLogout).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledTimes(2);
      expect(mockPush).toHaveBeenCalledWith('/logout');
    });
  });
});
