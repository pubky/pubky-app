import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHomeStore } from '@/stores/home/home.store';
import { LAYOUT } from '@/stores/home/home.types';
import { usePostRouteLayout } from './usePostRouteLayout';

const navigation = vi.hoisted(() => ({
  pathname: '/post/alice/post-id',
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.searchParams,
}));

describe('usePostRouteLayout', () => {
  beforeEach(() => {
    navigation.replace.mockClear();
    navigation.searchParams = new URLSearchParams();
    useHomeStore.setState({ layout: LAYOUT.COLUMNS });
  });

  it('changes a temporary route layout without changing the persisted home layout', () => {
    navigation.searchParams.set('layout', LAYOUT.LIST);

    const { result } = renderHook(() => usePostRouteLayout());

    expect(result.current.layout).toBe(LAYOUT.LIST);

    act(() => result.current.setLayout(LAYOUT.WIDE));

    expect(navigation.replace).toHaveBeenCalledWith('/post/alice/post-id?layout=wide');
    expect(useHomeStore.getState().layout).toBe(LAYOUT.COLUMNS);
  });

  it.each([LAYOUT.COLUMNS, LAYOUT.WIDE, LAYOUT.LIST])('resolves the %s route layout', (layout) => {
    navigation.searchParams.set('layout', layout);

    const { result } = renderHook(() => usePostRouteLayout());

    expect(result.current.layout).toBe(layout);
  });

  it('preserves unrelated query parameters when the temporary layout changes', () => {
    navigation.searchParams.set('focus', 'reply-id');
    navigation.searchParams.set('layout', LAYOUT.LIST);

    const { result } = renderHook(() => usePostRouteLayout());

    act(() => result.current.setLayout(LAYOUT.COLUMNS));

    expect(navigation.replace).toHaveBeenCalledWith('/post/alice/post-id?focus=reply-id&layout=columns');
  });

  it('uses and changes the persisted home layout when there is no route override', () => {
    const { result } = renderHook(() => usePostRouteLayout());

    expect(result.current.layout).toBe(LAYOUT.COLUMNS);

    act(() => result.current.setLayout(LAYOUT.WIDE));

    expect(useHomeStore.getState().layout).toBe(LAYOUT.WIDE);
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it.each([LAYOUT.VISUAL, 'unknown'])(
    'falls back to the persisted home layout for the unsupported %s route value',
    (layout) => {
      useHomeStore.setState({ layout: LAYOUT.WIDE });
      navigation.searchParams.set('layout', layout);

      const { result } = renderHook(() => usePostRouteLayout());

      expect(result.current.layout).toBe(LAYOUT.WIDE);
    },
  );
});
