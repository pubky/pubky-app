import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defaultPrivacyPreferences } from '@/core/stores/settings/settings.types';
import { mockMouseEvent } from '@/test-utils';
import { useLinkConfirmation } from './useLinkConfirmation';

const mockUseSettingsStore = vi.fn();

vi.mock('@/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core')>();
  return {
    ...actual,
    useSettingsStore: () => mockUseSettingsStore(),
  };
});

const createMockEvent = () =>
  mockMouseEvent<HTMLAnchorElement>({
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
  });

describe('useLinkConfirmation', () => {
  let windowOpenSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { hostname: 'localhost' },
    });

    mockUseSettingsStore.mockReturnValue({
      privacy: { ...defaultPrivacyPreferences, showConfirm: true },
    });
  });

  it('returns correct initial state', () => {
    const { result } = renderHook(() => useLinkConfirmation());

    expect(result.current.dialogOpen).toBe(false);
    expect(result.current.clickedLink).toBe('');
  });

  describe('handleLinkClick with showConfirm enabled and external link', () => {
    it('should prevent default behavior and stop propagation', () => {
      const { result } = renderHook(() => useLinkConfirmation());
      const mockEvent = createMockEvent();

      act(() => {
        result.current.handleLinkClick('https://external-site.com', mockEvent);
      });

      expect(mockEvent.stopPropagation).toHaveBeenCalledTimes(1);
      expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);
    });

    it('should set clickedLink to the URL and open dialog', () => {
      const { result } = renderHook(() => useLinkConfirmation());
      const mockEvent = createMockEvent();

      act(() => {
        result.current.handleLinkClick('https://external-site.com', mockEvent);
      });

      expect(result.current.clickedLink).toBe('https://external-site.com');
      expect(result.current.dialogOpen).toBe(true);
    });

    it('should NOT call window.open', () => {
      const { result } = renderHook(() => useLinkConfirmation());
      const mockEvent = createMockEvent();

      act(() => {
        result.current.handleLinkClick('https://external-site.com', mockEvent);
      });

      expect(windowOpenSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleLinkClick with showConfirm disabled', () => {
    beforeEach(() => {
      mockUseSettingsStore.mockReturnValue({
        privacy: { ...defaultPrivacyPreferences, showConfirm: false },
      });
    });

    it('should prevent default behavior and stop propagation', () => {
      const { result } = renderHook(() => useLinkConfirmation());
      const mockEvent = createMockEvent();

      act(() => {
        result.current.handleLinkClick('https://external-site.com', mockEvent);
      });

      expect(mockEvent.stopPropagation).toHaveBeenCalledTimes(1);
      expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);
    });

    it('should open the link directly via window.open', () => {
      const { result } = renderHook(() => useLinkConfirmation());
      const mockEvent = createMockEvent();

      act(() => {
        result.current.handleLinkClick('https://external-site.com', mockEvent);
      });

      expect(windowOpenSpy).toHaveBeenCalledWith('https://external-site.com', '_blank', 'noopener,noreferrer');
    });

    it('should NOT open the dialog', () => {
      const { result } = renderHook(() => useLinkConfirmation());
      const mockEvent = createMockEvent();

      act(() => {
        result.current.handleLinkClick('https://external-site.com', mockEvent);
      });

      expect(result.current.dialogOpen).toBe(false);
      expect(result.current.clickedLink).toBe('');
    });
  });

  describe('handleLinkClick with bypass protocols', () => {
    it('should open mailto: links directly even when showConfirm is enabled', () => {
      const { result } = renderHook(() => useLinkConfirmation());
      const mockEvent = createMockEvent();

      act(() => {
        result.current.handleLinkClick('mailto:test@example.com', mockEvent);
      });

      expect(windowOpenSpy).toHaveBeenCalledWith('mailto:test@example.com', '_blank', 'noopener,noreferrer');
      expect(result.current.dialogOpen).toBe(false);
      expect(result.current.clickedLink).toBe('');
    });

    it('should open tel: links directly even when showConfirm is enabled', () => {
      const { result } = renderHook(() => useLinkConfirmation());
      const mockEvent = createMockEvent();

      act(() => {
        result.current.handleLinkClick('tel:+1234567890', mockEvent);
      });

      expect(windowOpenSpy).toHaveBeenCalledWith('tel:+1234567890', '_blank', 'noopener,noreferrer');
      expect(result.current.dialogOpen).toBe(false);
      expect(result.current.clickedLink).toBe('');
    });
  });

  describe('handleLinkClick with same-domain URL', () => {
    it('should open directly even when showConfirm is enabled', () => {
      const { result } = renderHook(() => useLinkConfirmation());
      const mockEvent = createMockEvent();

      act(() => {
        result.current.handleLinkClick('https://localhost/some-page', mockEvent);
      });

      expect(windowOpenSpy).toHaveBeenCalledWith('https://localhost/some-page', '_blank', 'noopener,noreferrer');
      expect(result.current.dialogOpen).toBe(false);
      expect(result.current.clickedLink).toBe('');
    });
  });

  describe('handleLinkClick with different-domain URL when showConfirm is enabled', () => {
    it('should show dialog instead of opening the link', () => {
      const { result } = renderHook(() => useLinkConfirmation());
      const mockEvent = createMockEvent();

      act(() => {
        result.current.handleLinkClick('https://different-domain.com/page', mockEvent);
      });

      expect(windowOpenSpy).not.toHaveBeenCalled();
      expect(result.current.dialogOpen).toBe(true);
      expect(result.current.clickedLink).toBe('https://different-domain.com/page');
    });
  });

  describe('setDialogOpen', () => {
    it('can toggle dialog state', () => {
      const { result } = renderHook(() => useLinkConfirmation());

      expect(result.current.dialogOpen).toBe(false);

      act(() => {
        result.current.setDialogOpen(true);
      });

      expect(result.current.dialogOpen).toBe(true);

      act(() => {
        result.current.setDialogOpen(false);
      });

      expect(result.current.dialogOpen).toBe(false);
    });
  });

  describe('multiple clicks update clickedLink', () => {
    it('clicking different links updates the stored URL', () => {
      const { result } = renderHook(() => useLinkConfirmation());

      act(() => {
        result.current.handleLinkClick('https://first-external.com', createMockEvent());
      });

      expect(result.current.clickedLink).toBe('https://first-external.com');
      expect(result.current.dialogOpen).toBe(true);

      // Close the dialog, then click another link
      act(() => {
        result.current.setDialogOpen(false);
      });

      act(() => {
        result.current.handleLinkClick('https://second-external.com', createMockEvent());
      });

      expect(result.current.clickedLink).toBe('https://second-external.com');
      expect(result.current.dialogOpen).toBe(true);
    });
  });
});
