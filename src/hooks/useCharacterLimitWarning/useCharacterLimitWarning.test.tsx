import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/molecules/Toaster/toast';
import {
  MAX_CHARACTERS_TOAST_DESCRIPTION,
  MAX_CHARACTERS_TOAST_TITLE,
  useCharacterLimitWarning,
} from './useCharacterLimitWarning';

vi.mock('@/molecules/Toaster/toast');

describe('useCharacterLimitWarning', () => {
  beforeEach(() => {
    vi.mocked(toast).mockClear();
  });

  it('warns once when the content reaches the limit (issue #1761)', () => {
    const { rerender } = renderHook(({ limit }) => useCharacterLimitWarning(limit), {
      initialProps: { limit: { count: 1, max: 3 } as { count: number; max: number } | undefined },
    });

    expect(toast).not.toHaveBeenCalled();

    rerender({ limit: { count: 2, max: 3 } });
    expect(toast).not.toHaveBeenCalled();

    rerender({ limit: { count: 3, max: 3 } });
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith({
      variant: 'warning',
      title: MAX_CHARACTERS_TOAST_TITLE,
      description: MAX_CHARACTERS_TOAST_DESCRIPTION,
    });

    // Staying at the limit must not repeat the warning on every keystroke.
    rerender({ limit: { count: 3, max: 3 } });
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('re-arms once the content drops below the limit again', () => {
    const { rerender } = renderHook(({ limit }) => useCharacterLimitWarning(limit), {
      initialProps: { limit: { count: 3, max: 3 } },
    });

    expect(toast).toHaveBeenCalledTimes(1);

    rerender({ limit: { count: 2, max: 3 } });
    rerender({ limit: { count: 3, max: 3 } });

    expect(toast).toHaveBeenCalledTimes(2);
  });

  it('stays silent while the composer is collapsed', () => {
    const { rerender } = renderHook(({ limit }) => useCharacterLimitWarning(limit), {
      initialProps: { limit: undefined as { count: number; max: number } | undefined },
    });

    rerender({ limit: undefined });

    expect(toast).not.toHaveBeenCalled();
  });
});
