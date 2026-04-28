import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useFeedback } from './useFeedback';
import { FEEDBACK_MAX_CHARACTER_LENGTH } from '@/config';

// Mock fetch
global.fetch = vi.fn();

const TEST_USER_PUBKY = 'test-user-123';
const TEST_USER_NAME = 'Test User';

// Mock molecules
const mockToast = vi.fn();
vi.mock('@/molecules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/molecules')>();
  return {
    ...actual,
    useToast: vi.fn(() => ({
      toast: mockToast,
    })),
  };
});

// Mock useCurrentUserProfile hook
const mockUseCurrentUserProfile = vi.fn();
vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: () => mockUseCurrentUserProfile(),
}));

describe('useFeedback', () => {
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
    it('should return initial state with empty feedback', () => {
      const { result } = renderHook(() => useFeedback());

      expect(result.current.feedback).toBe('');
      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.hasContent).toBe(false);
      expect(typeof result.current.handleChange).toBe('function');
      expect(typeof result.current.submit).toBe('function');
      expect(typeof result.current.reset).toBe('function');
    });
  });

  describe('handleChange', () => {
    it('should update feedback when handleChange is called', () => {
      const { result } = renderHook(() => useFeedback());

      act(() => {
        const event = {
          target: { value: 'Test feedback' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleChange(event);
      });

      expect(result.current.feedback).toBe('Test feedback');
      expect(result.current.hasContent).toBe(true);
    });

    it('should accept feedback value regardless of length (prevention handled by textarea maxLength)', () => {
      const { result } = renderHook(() => useFeedback());
      const longText = 'a'.repeat(FEEDBACK_MAX_CHARACTER_LENGTH + 10);

      act(() => {
        const event = {
          target: { value: longText },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleChange(event);
      });

      // In real browser usage, the textarea's maxLength attribute prevents input beyond the limit.
      // This test simulates a direct handleChange call bypassing browser restrictions to test hook behavior in isolation.
      // Server-side validation exists in FeedbackValidators.validateComment to enforce the max length.
      expect(result.current.feedback.length).toBe(FEEDBACK_MAX_CHARACTER_LENGTH + 10);
    });

    it('should allow feedback up to max length', () => {
      const { result } = renderHook(() => useFeedback());
      const maxText = 'a'.repeat(FEEDBACK_MAX_CHARACTER_LENGTH);

      act(() => {
        const event = {
          target: { value: maxText },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleChange(event);
      });

      expect(result.current.feedback.length).toBe(FEEDBACK_MAX_CHARACTER_LENGTH);
    });
  });

  describe('hasContent', () => {
    it('should be false when feedback is empty', () => {
      const { result } = renderHook(() => useFeedback());
      expect(result.current.hasContent).toBe(false);
    });

    it('should be false when feedback is only whitespace', () => {
      const { result } = renderHook(() => useFeedback());

      act(() => {
        const event = {
          target: { value: '   ' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleChange(event);
      });

      expect(result.current.hasContent).toBe(false);
    });

    it('should be true when feedback has content', () => {
      const { result } = renderHook(() => useFeedback());

      act(() => {
        const event = {
          target: { value: 'Test feedback' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleChange(event);
      });

      expect(result.current.hasContent).toBe(true);
    });
  });

  describe('submit', () => {
    it('should not submit when feedback is empty', async () => {
      const { result } = renderHook(() => useFeedback());

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should not submit when feedback is only whitespace', async () => {
      const { result } = renderHook(() => useFeedback());

      act(() => {
        const event = {
          target: { value: '   ' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleChange(event);
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should submit feedback and set isSuccess on success', async () => {
      const { result } = renderHook(() => useFeedback());

      act(() => {
        const event = {
          target: { value: 'Test feedback' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleChange(event);
      });

      await act(async () => {
        await result.current.submit();
      });

      await waitFor(() => {
        expect(result.current.isSubmitting).toBe(false);
        expect(result.current.isSuccess).toBe(true);
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pubky: TEST_USER_PUBKY,
          comment: 'Test feedback',
          name: TEST_USER_NAME,
        }),
      });
    });

    it('should not submit when already submitting', async () => {
      // Create a delayed fetch to simulate network latency
      let resolveFirstFetch: () => void;
      const firstFetchPromise = new Promise<void>((resolve) => {
        resolveFirstFetch = resolve;
      });

      (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
        await firstFetchPromise;
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useFeedback());

      act(() => {
        const event = {
          target: { value: 'Test feedback' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleChange(event);
      });

      // Start first submission (don't await)
      let submitPromise: Promise<void>;
      act(() => {
        submitPromise = result.current.submit();
      });

      // Wait for isSubmitting to be true
      await waitFor(() => {
        expect(result.current.isSubmitting).toBe(true);
      });

      // Try to submit again while first is in progress (should be blocked)
      await act(async () => {
        await result.current.submit();
      });

      // Resolve the first fetch
      resolveFirstFetch!();

      // Wait for first submission to complete
      await act(async () => {
        await submitPromise!;
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.isSubmitting).toBe(false);
      });

      // Fetch should only be called once (second submit was blocked)
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should not submit when currentUserPubky is null', async () => {
      mockUseCurrentUserProfile.mockReturnValue({
        currentUserPubky: null,
        userDetails: { name: TEST_USER_NAME },
      });

      const { result } = renderHook(() => useFeedback());

      act(() => {
        const event = {
          target: { value: 'Test feedback' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleChange(event);
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should not submit when userDetails.name is missing', async () => {
      mockUseCurrentUserProfile.mockReturnValue({
        currentUserPubky: TEST_USER_PUBKY,
        userDetails: null,
      });

      const { result } = renderHook(() => useFeedback());

      act(() => {
        const event = {
          target: { value: 'Test feedback' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleChange(event);
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('should reset all state when reset is called', async () => {
      const { result } = renderHook(() => useFeedback());

      act(() => {
        const event = {
          target: { value: 'Test feedback' },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        result.current.handleChange(event);
      });

      expect(result.current.feedback).toBe('Test feedback');

      await act(async () => {
        await result.current.submit();
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.feedback).toBe('');
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.isSubmitting).toBe(false);
    });
  });
});
