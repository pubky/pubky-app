import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProfilePostsFilter } from './useProfilePostsFilter';
import { PROFILE_POSTS_FILTER_DEBOUNCE_MS } from './useProfilePostsFilter.constants';

describe('useProfilePostsFilter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts idle with an empty input and no active query', () => {
    const { result } = renderHook(() => useProfilePostsFilter());

    expect(result.current.inputValue).toBe('');
    expect(result.current.activeQuery).toBeNull();
  });

  it('debounces the query: inactive while typing, active after the delay', () => {
    const { result } = renderHook(() => useProfilePostsFilter());

    act(() => {
      result.current.onInputChange('bitcoin');
    });
    expect(result.current.inputValue).toBe('bitcoin');
    expect(result.current.activeQuery).toBeNull();

    act(() => {
      vi.advanceTimersByTime(PROFILE_POSTS_FILTER_DEBOUNCE_MS - 1);
    });
    expect(result.current.activeQuery).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.activeQuery).toBe('bitcoin');
  });

  it('restarts the debounce on every keystroke (only the final value applies)', () => {
    const { result } = renderHook(() => useProfilePostsFilter());

    act(() => {
      result.current.onInputChange('bit');
    });
    act(() => {
      vi.advanceTimersByTime(PROFILE_POSTS_FILTER_DEBOUNCE_MS - 100);
    });
    act(() => {
      result.current.onInputChange('bitcoin');
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    // The first keystroke's timer was superseded, not fired.
    expect(result.current.activeQuery).toBeNull();

    act(() => {
      vi.advanceTimersByTime(PROFILE_POSTS_FILTER_DEBOUNCE_MS);
    });
    expect(result.current.activeQuery).toBe('bitcoin');
  });

  it('applies the validator: trims the query and rejects invalid input as null', () => {
    const { result } = renderHook(() => useProfilePostsFilter());

    const applyInput = (value: string) => {
      act(() => {
        result.current.onInputChange(value);
      });
      act(() => {
        vi.advanceTimersByTime(PROFILE_POSTS_FILTER_DEBOUNCE_MS);
      });
    };

    applyInput('  bitcoin wallet  ');
    expect(result.current.activeQuery).toBe('bitcoin wallet');

    // Below the 2-char minimum.
    applyInput('a');
    expect(result.current.activeQuery).toBeNull();

    // Above the 30-char maximum.
    applyInput('a'.repeat(31));
    expect(result.current.activeQuery).toBeNull();

    // Above the 4-term maximum.
    applyInput('one two three four five');
    expect(result.current.activeQuery).toBeNull();
  });

  it('exposes the validator message for a settled invalid query and clears it again', () => {
    const { result } = renderHook(() => useProfilePostsFilter());

    const applyInput = (value: string) => {
      act(() => {
        result.current.onInputChange(value);
      });
      act(() => {
        vi.advanceTimersByTime(PROFILE_POSTS_FILTER_DEBOUNCE_MS);
      });
    };

    expect(result.current.validationMessage).toBeNull();

    applyInput('one two three four five');
    expect(result.current.activeQuery).toBeNull();
    expect(result.current.validationMessage).toMatch(/up to 4 terms/);

    // A valid query replaces the message with an active filter.
    applyInput('bitcoin');
    expect(result.current.activeQuery).toBe('bitcoin');
    expect(result.current.validationMessage).toBeNull();

    // While typing (debounce pending) the previous message state holds; no flicker.
    applyInput('a');
    expect(result.current.validationMessage).toMatch(/at least 2 characters/);

    // Clearing resets the message synchronously, like the active query.
    act(() => {
      result.current.onInputChange('');
    });
    expect(result.current.validationMessage).toBeNull();
  });

  it('clears immediately: cancels the pending debounce and resets the active query', () => {
    const { result } = renderHook(() => useProfilePostsFilter());

    act(() => {
      result.current.onInputChange('bitcoin');
    });
    act(() => {
      vi.advanceTimersByTime(PROFILE_POSTS_FILTER_DEBOUNCE_MS);
    });
    expect(result.current.activeQuery).toBe('bitcoin');

    act(() => {
      result.current.onInputChange('bitcoin wallets');
    });
    act(() => {
      result.current.onInputChange('');
    });
    // No debounce lag on clear: the ordinary feed is back at once…
    expect(result.current.activeQuery).toBeNull();

    // …and the pending 'bitcoin wallets' apply was canceled, so nothing
    // resurrects the search after the delay.
    act(() => {
      vi.advanceTimersByTime(PROFILE_POSTS_FILTER_DEBOUNCE_MS * 2);
    });
    expect(result.current.activeQuery).toBeNull();
    expect(result.current.inputValue).toBe('');
  });

  it('treats whitespace-only input as a clear', () => {
    const { result } = renderHook(() => useProfilePostsFilter());

    act(() => {
      result.current.onInputChange('bitcoin');
    });
    act(() => {
      vi.advanceTimersByTime(PROFILE_POSTS_FILTER_DEBOUNCE_MS);
    });
    expect(result.current.activeQuery).toBe('bitcoin');

    act(() => {
      result.current.onInputChange('   ');
    });
    expect(result.current.activeQuery).toBeNull();
  });
});
