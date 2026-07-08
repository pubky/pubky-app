import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayoutContext';
import { useEffectiveTagsLayout } from './useEffectiveTagsLayout';

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

const mockUseIsMobile = vi.mocked(useIsMobile);

describe('useEffectiveTagsLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
  });

  it('defaults to inline when no provider is present', () => {
    const { result } = renderHook(() => useEffectiveTagsLayout());
    expect(result.current).toBe('inline');
  });

  it('keeps side layout on desktop', () => {
    const { result } = renderHook(() => useEffectiveTagsLayout(), {
      wrapper: ({ children }) => <PostMainLayoutProvider tagsLayout="side">{children}</PostMainLayoutProvider>,
    });

    expect(result.current).toBe('side');
  });

  it('collapses side layout to inline on mobile', () => {
    mockUseIsMobile.mockReturnValue(true);

    const { result } = renderHook(() => useEffectiveTagsLayout(), {
      wrapper: ({ children }) => <PostMainLayoutProvider tagsLayout="side">{children}</PostMainLayoutProvider>,
    });

    expect(result.current).toBe('inline');
  });
});
