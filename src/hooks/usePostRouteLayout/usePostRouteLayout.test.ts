import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LAYOUT } from '@/stores/home/home.types';
import { usePostRouteLayout } from './usePostRouteLayout';

const mockSearchParams = vi.hoisted(() => new URLSearchParams());

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

describe('usePostRouteLayout', () => {
  beforeEach(() => {
    mockSearchParams.delete('layout');
  });

  it('returns List for the supported route override', () => {
    mockSearchParams.set('layout', 'list');

    const { result } = renderHook(() => usePostRouteLayout());

    expect(result.current).toBe(LAYOUT.LIST);
  });

  it('ignores absent and unsupported layout values', () => {
    const { result, rerender } = renderHook(() => usePostRouteLayout());
    expect(result.current).toBeUndefined();

    mockSearchParams.set('layout', 'wide');
    rerender();

    expect(result.current).toBeUndefined();
  });
});
