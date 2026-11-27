import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBeforeUnloadGuard } from './useBeforeUnloadGuard';

const unload = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

describe('useBeforeUnloadGuard', () => {
  it('prevents the unload only while active and removes its listener on unmount', () => {
    const { rerender, unmount } = renderHook(({ active }) => useBeforeUnloadGuard(active), {
      initialProps: { active: false },
    });
    expect(unload()).toBe(false);

    rerender({ active: true });
    expect(unload()).toBe(true);

    rerender({ active: false });
    expect(unload()).toBe(false);

    rerender({ active: true });
    unmount();
    expect(unload()).toBe(false);
  });
});
