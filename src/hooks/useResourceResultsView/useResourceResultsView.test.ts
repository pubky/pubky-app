import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useResourceResultsView } from './useResourceResultsView';

const mocks = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({ useSearchParams: () => mocks.params }));

describe('useResourceResultsView', () => {
  beforeEach(() => {
    mocks.params = new URLSearchParams();
    window.history.replaceState(null, '', '/search?kind=event&when=month');
  });

  it('is the list unless the address asks for the map', () => {
    expect(renderHook(() => useResourceResultsView()).result.current.view).toBe('list');

    mocks.params = new URLSearchParams('kind=event&view=map');
    expect(renderHook(() => useResourceResultsView()).result.current.view).toBe('map');

    mocks.params = new URLSearchParams('view=globe');
    expect(renderHook(() => useResourceResultsView()).result.current.view).toBe('list');
  });

  it('puts the map in the address in place of the current entry, beside the search’s filters', () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    const { result } = renderHook(() => useResourceResultsView());

    result.current.setView('map');

    // A null state: Next adds its own and keeps useSearchParams in step
    expect(replace).toHaveBeenLastCalledWith(null, '', '/search?kind=event&when=month&view=map');
  });

  it('leaves the list out of the address: a plain search keeps its plain link', () => {
    window.history.replaceState(null, '', '/search?kind=place&view=map#top');
    const replace = vi.spyOn(window.history, 'replaceState');
    const { result } = renderHook(() => useResourceResultsView());

    result.current.setView('list');

    expect(replace).toHaveBeenLastCalledWith(null, '', '/search?kind=place#top');
  });
});
