import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { POST_ID_STAGING_FIXTURE, PUBKY_52_STAGING_FIXTURE, PUBKY_INVALID_TOO_LONG } from '@/test-utils/pubky';
import { usePostMissing } from './usePostMissing';

const VALID_COMPOSITE_POST_ID = `${PUBKY_52_STAGING_FIXTURE}:${POST_ID_STAGING_FIXTURE}`;

const SHORT_POST_DETAILS = {
  id: VALID_COMPOSITE_POST_ID,
  indexed_at: Date.now(),
  kind: 'short' as const,
  uri: `pubky://${PUBKY_52_STAGING_FIXTURE}/pub/pubky.app/posts/${POST_ID_STAGING_FIXTURE}`,
  content: 'Hello',
  attachments: [],
  is_moderated: false,
  is_blurred: false,
} satisfies EnrichedPostDetails;

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

describe('usePostMissing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: SHORT_POST_DETAILS,
      isLoading: false,
    });
  });

  it('reports missing without fetching when the composite id is invalid', () => {
    const invalidComposite = `${PUBKY_INVALID_TOO_LONG}:${POST_ID_STAGING_FIXTURE}`;
    const { result } = renderHook(() => usePostMissing(invalidComposite));

    expect(result.current.postMissing).toBe(true);
    expect(usePostDetails).toHaveBeenCalledWith(invalidComposite, { enabled: false });
  });

  it('reports missing when the fetch settled without a post', () => {
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: null,
      isLoading: false,
    });

    const { result } = renderHook(() => usePostMissing(VALID_COMPOSITE_POST_ID));

    expect(result.current.postMissing).toBe(true);
  });

  it('does not report missing while loading', () => {
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: null,
      isLoading: true,
    });

    const { result } = renderHook(() => usePostMissing(VALID_COMPOSITE_POST_ID));

    expect(result.current.postMissing).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  it('returns post details when resolved', () => {
    const { result } = renderHook(() => usePostMissing(VALID_COMPOSITE_POST_ID));

    expect(result.current.postMissing).toBe(false);
    expect(result.current.postDetails).toBe(SHORT_POST_DETAILS);
    expect(usePostDetails).toHaveBeenCalledWith(VALID_COMPOSITE_POST_ID, { enabled: true });
  });
});
