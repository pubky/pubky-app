import { beforeEach, describe, expect, it } from 'vitest';
import { useContextualBannerStore } from './contextualBanner.store';

describe('useContextualBannerStore', () => {
  beforeEach(() => {
    useContextualBannerStore.setState({ visible: false });
  });

  it('starts hidden', () => {
    // The initial state, not getState(): beforeEach already forces visible to false.
    expect(useContextualBannerStore.getInitialState().visible).toBe(false);
  });

  it('show flags the banner as visible', () => {
    useContextualBannerStore.getState().show();
    expect(useContextualBannerStore.getState().visible).toBe(true);
  });

  it('show is idempotent while the banner is already visible', () => {
    const { show } = useContextualBannerStore.getState();
    show();
    show();
    expect(useContextualBannerStore.getState().visible).toBe(true);
  });

  it('hide clears the flag', () => {
    const { show, hide } = useContextualBannerStore.getState();
    show();
    hide();
    expect(useContextualBannerStore.getState().visible).toBe(false);
  });

  it('hide is a no-op when the banner is already hidden', () => {
    const { hide } = useContextualBannerStore.getState();
    expect(() => hide()).not.toThrow();
    expect(useContextualBannerStore.getState().visible).toBe(false);
  });

  it('notifies subscribers on every visibility change', () => {
    const seen: boolean[] = [];
    const unsubscribe = useContextualBannerStore.subscribe((state) => seen.push(state.visible));
    const { show, hide } = useContextualBannerStore.getState();
    show();
    hide();
    unsubscribe();
    expect(seen).toEqual([true, false]);
  });
});
