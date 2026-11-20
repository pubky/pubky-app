import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHomeStore } from '@/stores/home/home.store';
import { CONTENT } from '@/stores/home/home.types';
import { useResourceFiltersTab } from './useResourceFiltersTab';

const url = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(url.search) }));

describe('useResourceFiltersTab', () => {
  beforeEach(() => {
    useHomeStore.setState({ content: CONTENT.ALL });
    window.history.replaceState(null, '', '/home');
  });
  afterEach(() => {
    url.search = '';
    window.history.replaceState(null, '', '/');
  });

  it('opens the External resources tab for a URL with its filters', () => {
    url.search = 'kind=event&when=week';
    renderHook(() => useResourceFiltersTab({ feed: true }));

    expect(useHomeStore.getState().content).toBe(CONTENT.RESOURCES);
  });

  it('leaves a feed’s Content alone for Search’s own filters', () => {
    url.search = 'by=hkdrfoddu3rmeucj1mazu4aeg11nxj7uaxybnmots5o9s5hd3t6y&match=all&and=jazz';
    renderHook(() => useResourceFiltersTab({ feed: true }));
    expect(useHomeStore.getState().content).toBe(CONTENT.ALL);

    // Search opens the tab for them
    renderHook(() => useResourceFiltersTab());
    expect(useHomeStore.getState().content).toBe(CONTENT.RESOURCES);
  });

  it('drops the filters from the URL when another Content is picked', () => {
    url.search = 'kind=event&when=week';
    window.history.replaceState(null, '', '/home?kind=event&when=week&q=x');
    const { rerender } = renderHook(() => useResourceFiltersTab({ feed: true }));
    expect(useHomeStore.getState().content).toBe(CONTENT.RESOURCES);

    useHomeStore.setState({ content: CONTENT.LINKS });
    rerender();
    expect(window.location.search).toBe('?q=x');
  });
});
