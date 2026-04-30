import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useReportPost } from './useReportPost';
import { REPORT_POST_STEPS, REPORT_API_ENDPOINT } from './useReportPost.constants';
import { HttpMethod, JSON_HEADERS } from '@/libs/http/http.types';
import { REPORT_ISSUE_TYPES, REPORT_REASON_MAX_LENGTH } from '@/pipes/report/report.constants';
// Mock fetch
global.fetch = vi.fn();

const TEST_USER_PUBKY = 'test-user-123';
const TEST_USER_NAME = 'Test User';
const TEST_POST_ID = 'author-pubky-456:post-id-789';
const TEST_POST_URL = 'https://example.com/post/author-pubky-456/post-id-789';

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    origin: 'https://example.com',
  },
  writable: true,
});

// Mock useCurrentUserProfile hook
const mockUseCurrentUserProfile = vi.fn();
vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: () => mockUseCurrentUserProfile(),
}));

// Mock parseCompositeId
vi.mock('@/models/models.utils', () => ({
  parseCompositeId: (id: string) => {
    const [pubky, postId] = id.split(':');
    return { pubky, id: postId };
  },
}));

// Mock toast helpers
const mockShowErrorToast = vi.fn();
vi.mock('@/molecules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/molecules')>();
  return {
    ...actual,
    showErrorToast: (params: { title?: string; description: string }) => mockShowErrorToast(params),
  };
});

// Mock Logger
vi.mock('@/libs/logger/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/logger/logger')>();
  return {
    ...actual,
    Logger: {
      error: vi.fn(),
    },
  };
});

describe('useReportPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated user with profile loaded
    mockUseCurrentUserProfile.mockReturnValue({
      currentUserPubky: TEST_USER_PUBKY,
      userDetails: { name: TEST_USER_NAME },
    });
    // Default successful fetch response
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
  });

  describe('Initial State', () => {
    it('should return initial state with issue selection step', () => {
      const { result } = renderHook(() => useReportPost(TEST_POST_ID));

      expect(result.current.step).toBe(REPORT_POST_STEPS.ISSUE_SELECTION);
      expect(result.current.selectedIssueType).toBeNull();
      expect(result.current.reason).toBe('');
      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.hasContent).toBe(false);
    });
  });

  describe('postUrl construction', () => {
    it('should construct postUrl correctly from postId', async () => {
      const { result } = renderHook(() => useReportPost(TEST_POST_ID));

      act(() => {
        result.current.selectIssueType(REPORT_ISSUE_TYPES.PERSONAL_INFO);
      });

      act(() => {
        const event = {
          target: { value: 'Test reason' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleReasonChange(event);
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        REPORT_API_ENDPOINT,
        expect.objectContaining({
          body: expect.stringContaining(TEST_POST_URL),
        }),
      );
    });
  });

  describe('selectIssueType', () => {
    it('should update selectedIssueType and advance to reason step', () => {
      const { result } = renderHook(() => useReportPost(TEST_POST_ID));

      act(() => {
        result.current.selectIssueType(REPORT_ISSUE_TYPES.PERSONAL_INFO);
      });

      expect(result.current.selectedIssueType).toBe(REPORT_ISSUE_TYPES.PERSONAL_INFO);
      expect(result.current.step).toBe(REPORT_POST_STEPS.REASON_INPUT);
    });
  });

  describe('handleReasonChange', () => {
    it('should update reason when handleReasonChange is called', () => {
      const { result } = renderHook(() => useReportPost(TEST_POST_ID));

      act(() => {
        result.current.selectIssueType(REPORT_ISSUE_TYPES.PERSONAL_INFO);
      });

      act(() => {
        const event = {
          target: { value: 'This post contains harmful content' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleReasonChange(event);
      });

      expect(result.current.reason).toBe('This post contains harmful content');
      expect(result.current.hasContent).toBe(true);
    });

    it('should accept reason value regardless of length (prevention handled by textarea maxLength)', () => {
      const { result } = renderHook(() => useReportPost(TEST_POST_ID));
      const longText = 'a'.repeat(REPORT_REASON_MAX_LENGTH + 10);

      act(() => {
        const event = {
          target: { value: longText },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleReasonChange(event);
      });

      expect(result.current.reason.length).toBe(REPORT_REASON_MAX_LENGTH + 10);
    });
  });

  describe('hasContent', () => {
    it('should be false when reason is empty', () => {
      const { result } = renderHook(() => useReportPost(TEST_POST_ID));
      expect(result.current.hasContent).toBe(false);
    });

    it('should be false when reason is only whitespace', () => {
      const { result } = renderHook(() => useReportPost(TEST_POST_ID));

      act(() => {
        const event = {
          target: { value: '   ' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleReasonChange(event);
      });

      expect(result.current.hasContent).toBe(false);
    });

    it('should be true when reason has content', () => {
      const { result } = renderHook(() => useReportPost(TEST_POST_ID));

      act(() => {
        const event = {
          target: { value: 'Valid reason' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleReasonChange(event);
      });

      expect(result.current.hasContent).toBe(true);
    });
  });

  describe('submit', () => {
    it('should not submit when reason is empty', async () => {
      const { result } = renderHook(() => useReportPost(TEST_POST_ID));

      act(() => {
        result.current.selectIssueType(REPORT_ISSUE_TYPES.PERSONAL_INFO);
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should not submit when issue type is not selected', async () => {
      const { result } = renderHook(() => useReportPost(TEST_POST_ID));

      act(() => {
        const event = {
          target: { value: 'Some reason' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleReasonChange(event);
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should submit report and set isSuccess on success', async () => {
      const { result } = renderHook(() => useReportPost(TEST_POST_ID));

      act(() => {
        result.current.selectIssueType(REPORT_ISSUE_TYPES.PERSONAL_INFO);
      });

      act(() => {
        const event = {
          target: { value: 'This post leaks personal information' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleReasonChange(event);
      });

      await act(async () => {
        await result.current.submit();
      });

      await waitFor(() => {
        expect(result.current.isSubmitting).toBe(false);
        expect(result.current.isSuccess).toBe(true);
      });

      expect(global.fetch).toHaveBeenCalledWith(REPORT_API_ENDPOINT, {
        method: HttpMethod.POST,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          pubky: TEST_USER_PUBKY,
          postUrl: TEST_POST_URL,
          issueType: REPORT_ISSUE_TYPES.PERSONAL_INFO,
          reason: 'This post leaks personal information',
          name: TEST_USER_NAME,
        }),
      });
    });

    it('should show toast when submission fails', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Server error' }),
      } as Response);

      const { result } = renderHook(() => useReportPost(TEST_POST_ID));

      act(() => {
        result.current.selectIssueType(REPORT_ISSUE_TYPES.PERSONAL_INFO);
      });

      act(() => {
        const event = {
          target: { value: 'Some reason' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleReasonChange(event);
      });

      await act(async () => {
        await result.current.submit();
      });

      await waitFor(() => {
        expect(result.current.isSubmitting).toBe(false);
        expect(result.current.isSuccess).toBe(false);
      });

      expect(mockShowErrorToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Server error',
        }),
      );
    });

    it('should not submit when already submitting', async () => {
      let resolveFirstFetch: () => void;
      const firstFetchPromise = new Promise<void>((resolve) => {
        resolveFirstFetch = resolve;
      });

      (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
        await firstFetchPromise;
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useReportPost(TEST_POST_ID));

      act(() => {
        result.current.selectIssueType(REPORT_ISSUE_TYPES.PERSONAL_INFO);
      });

      act(() => {
        const event = {
          target: { value: 'Some reason' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleReasonChange(event);
      });

      // Start first submission (don't await)
      let submitPromise: Promise<void>;
      act(() => {
        submitPromise = result.current.submit();
      });

      await waitFor(() => {
        expect(result.current.isSubmitting).toBe(true);
      });

      // Try to submit again while first is in progress
      await act(async () => {
        await result.current.submit();
      });

      // Resolve the first fetch
      resolveFirstFetch!();

      await act(async () => {
        await submitPromise!;
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.isSubmitting).toBe(false);
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should show toast when currentUserPubky is null', async () => {
      mockUseCurrentUserProfile.mockReturnValue({
        currentUserPubky: null,
        userDetails: { name: TEST_USER_NAME },
      });

      const { result } = renderHook(() => useReportPost(TEST_POST_ID));

      act(() => {
        result.current.selectIssueType(REPORT_ISSUE_TYPES.PERSONAL_INFO);
      });

      act(() => {
        const event = {
          target: { value: 'Some reason' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleReasonChange(event);
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(mockShowErrorToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'User profile not loaded. Please try again.',
        }),
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should show toast when userDetails.name is missing', async () => {
      mockUseCurrentUserProfile.mockReturnValue({
        currentUserPubky: TEST_USER_PUBKY,
        userDetails: null,
      });

      const { result } = renderHook(() => useReportPost(TEST_POST_ID));

      act(() => {
        result.current.selectIssueType(REPORT_ISSUE_TYPES.PERSONAL_INFO);
      });

      act(() => {
        const event = {
          target: { value: 'Some reason' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleReasonChange(event);
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(mockShowErrorToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'User profile not loaded. Please try again.',
        }),
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should show toast on network errors', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useReportPost(TEST_POST_ID));

      act(() => {
        result.current.selectIssueType(REPORT_ISSUE_TYPES.PERSONAL_INFO);
      });

      act(() => {
        const event = {
          target: { value: 'Some reason' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleReasonChange(event);
      });

      await act(async () => {
        await result.current.submit();
      });

      await waitFor(() => {
        expect(result.current.isSubmitting).toBe(false);
        expect(result.current.isSuccess).toBe(false);
      });

      expect(mockShowErrorToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Network error',
        }),
      );
    });
  });

  describe('reset', () => {
    it('should reset all state when reset is called', async () => {
      const { result } = renderHook(() => useReportPost(TEST_POST_ID));

      // Set up some state
      act(() => {
        result.current.selectIssueType(REPORT_ISSUE_TYPES.PERSONAL_INFO);
      });

      act(() => {
        const event = {
          target: { value: 'Some reason' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleReasonChange(event);
      });

      await act(async () => {
        await result.current.submit();
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.step).toBe(REPORT_POST_STEPS.ISSUE_SELECTION);
      expect(result.current.selectedIssueType).toBeNull();
      expect(result.current.reason).toBe('');
      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.isSuccess).toBe(false);
    });
  });
});
