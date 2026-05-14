import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockKeyboardEvent } from '@/test-utils/react-events';
import { usePostListKeyboard } from './usePostListKeyboard';

interface CardFixture {
  element: HTMLDivElement;
  focusSpy: ReturnType<typeof vi.fn>;
  scrollIntoViewSpy: ReturnType<typeof vi.fn>;
}

const createCardFixture = (): CardFixture => {
  const element = document.createElement('div');
  const focusSpy = vi.fn();
  const scrollIntoViewSpy = vi.fn();

  Object.defineProperty(element, 'focus', {
    configurable: true,
    value: focusSpy,
  });
  Object.defineProperty(element, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoViewSpy,
  });

  return { element, focusSpy, scrollIntoViewSpy };
};

const setup = (itemCount: number) => {
  const hook = renderHook(() => usePostListKeyboard());
  const cards = Array.from({ length: itemCount }, () => createCardFixture());

  act(() => {
    cards.forEach((card, index) => {
      hook.result.current.setCardRef(index)(card.element);
    });
  });

  return { cards, hook };
};

const createKeyboardEvent = (key: string, target: HTMLElement): React.KeyboardEvent =>
  mockKeyboardEvent({
    key,
    target,
    preventDefault: vi.fn(),
  });

describe('usePostListKeyboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('moves to next card on ArrowDown', () => {
    const { cards, hook } = setup(3);
    const event = createKeyboardEvent('ArrowDown', cards[0].element);

    act(() => {
      hook.result.current.onListKeyDown(event);
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(cards[1].focusSpy).toHaveBeenCalledTimes(1);
    expect(cards[1].scrollIntoViewSpy).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('moves to previous card on ArrowUp', () => {
    const { cards, hook } = setup(3);
    const event = createKeyboardEvent('ArrowUp', cards[1].element);

    act(() => {
      hook.result.current.onListKeyDown(event);
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(cards[0].focusSpy).toHaveBeenCalledTimes(1);
    expect(cards[0].scrollIntoViewSpy).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('supports j/k as ArrowDown/ArrowUp aliases', () => {
    const { cards, hook } = setup(3);

    const downEvent = createKeyboardEvent('j', cards[0].element);
    act(() => {
      hook.result.current.onListKeyDown(downEvent);
    });

    const upEvent = createKeyboardEvent('k', cards[1].element);
    act(() => {
      hook.result.current.onListKeyDown(upEvent);
    });

    expect(downEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(upEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(cards[1].focusSpy).toHaveBeenCalledTimes(1);
    expect(cards[0].focusSpy).toHaveBeenCalledTimes(1);
  });

  it('jumps to first/last card on Home/End', () => {
    const { cards, hook } = setup(4);

    const endEvent = createKeyboardEvent('End', cards[1].element);
    act(() => {
      hook.result.current.onListKeyDown(endEvent);
    });

    expect(endEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(cards[3].focusSpy).toHaveBeenCalledTimes(1);

    const homeEvent = createKeyboardEvent('Home', cards[3].element);
    act(() => {
      hook.result.current.onListKeyDown(homeEvent);
    });

    expect(homeEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(cards[0].focusSpy).toHaveBeenCalledTimes(1);
  });

  it('clamps keyboard movement at list boundaries', () => {
    const { cards, hook } = setup(2);

    const upFromFirst = createKeyboardEvent('ArrowUp', cards[0].element);
    act(() => {
      hook.result.current.onListKeyDown(upFromFirst);
    });

    expect(upFromFirst.preventDefault).toHaveBeenCalledTimes(1);
    expect(cards[0].focusSpy).toHaveBeenCalledTimes(1);

    const downFromLast = createKeyboardEvent('ArrowDown', cards[1].element);
    act(() => {
      hook.result.current.onListKeyDown(downFromLast);
    });

    expect(downFromLast.preventDefault).toHaveBeenCalledTimes(1);
    expect(cards[1].focusSpy).toHaveBeenCalledTimes(1);
  });

  it('navigates from a containing card when focus is on a non-interactive descendant', () => {
    const { cards, hook } = setup(3);

    // Simulate a parent-post article wrapper inside cards[1] (tabIndex=0, role=article, not a button/input)
    const innerArticle = document.createElement('div');
    innerArticle.setAttribute('role', 'article');
    innerArticle.setAttribute('tabindex', '0');
    cards[1].element.appendChild(innerArticle);

    const event = createKeyboardEvent('j', innerArticle);
    act(() => {
      hook.result.current.onListKeyDown(event);
    });

    // j from a non-interactive child of cards[1] should move to cards[2]
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(cards[2].focusSpy).toHaveBeenCalledTimes(1);
    expect(cards[1].focusSpy).not.toHaveBeenCalled();
  });

  it('ignores key events from descendant controls', () => {
    const { cards, hook } = setup(2);

    const button = document.createElement('button');
    cards[0].element.appendChild(button);

    const event = createKeyboardEvent('ArrowDown', button);
    act(() => {
      hook.result.current.onListKeyDown(event);
    });

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(cards[0].focusSpy).not.toHaveBeenCalled();
    expect(cards[1].focusSpy).not.toHaveBeenCalled();
  });
});

describe('usePostListKeyboard — cardSelector option', () => {
  const SELECTOR = '[data-nav="true"]';

  /** Creates a container with ref-registered cards (optionally with the selector attr). */
  const setupWithSelector = (itemCount: number, { addAttrToRefs = false } = {}) => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const hook = renderHook(() => usePostListKeyboard({ cardSelector: SELECTOR }));
    const cards = Array.from({ length: itemCount }, () => createCardFixture());

    act(() => {
      cards.forEach((card, index) => {
        if (addAttrToRefs) card.element.setAttribute('data-nav', 'true');
        container.appendChild(card.element);
        hook.result.current.setCardRef(index)(card.element);
      });
    });

    return { container, cards, hook };
  };

  const createContainerEvent = (key: string, target: HTMLElement, currentTarget: HTMLElement): React.KeyboardEvent =>
    mockKeyboardEvent({ key, target, currentTarget, preventDefault: vi.fn() });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reaches a selector-matched sibling (e.g. ShowMoreReplies) with j from the last registered card', () => {
    const { container, cards, hook } = setupWithSelector(2);

    const extra = createCardFixture();
    extra.element.setAttribute('data-nav', 'true');
    container.appendChild(extra.element);

    const event = createContainerEvent('j', cards[1].element, container);
    act(() => {
      hook.result.current.onListKeyDown(event);
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(extra.focusSpy).toHaveBeenCalledTimes(1);
    expect(cards[0].focusSpy).not.toHaveBeenCalled();
    expect(cards[1].focusSpy).not.toHaveBeenCalled();
  });

  it('navigates back from extra sibling to last registered card with k', () => {
    const { container, cards, hook } = setupWithSelector(2);

    const extra = createCardFixture();
    extra.element.setAttribute('data-nav', 'true');
    container.appendChild(extra.element);

    const event = createContainerEvent('k', extra.element, container);
    act(() => {
      hook.result.current.onListKeyDown(event);
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(cards[1].focusSpy).toHaveBeenCalledTimes(1);
    expect(extra.focusSpy).not.toHaveBeenCalled();
  });

  it('excludes selector-matched elements nested inside registered refs (nested child cards)', () => {
    const { container, cards, hook } = setupWithSelector(2);

    // Simulate a depth>0 nested card inside cards[0] — same selector but should be excluded
    const nested = createCardFixture();
    nested.element.setAttribute('data-nav', 'true');
    cards[0].element.appendChild(nested.element);

    // j from cards[0] should go to cards[1], skipping the nested card entirely
    const event = createContainerEvent('j', cards[0].element, container);
    act(() => {
      hook.result.current.onListKeyDown(event);
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(cards[1].focusSpy).toHaveBeenCalledTimes(1);
    expect(nested.focusSpy).not.toHaveBeenCalled();
  });

  it('does not duplicate registered cards that also match the selector', () => {
    // In ThreadTree, registered cards themselves have data-post-list-card="true".
    // They must not appear twice in the navigation list.
    const { container, cards, hook } = setupWithSelector(2, { addAttrToRefs: true });

    const extra = createCardFixture();
    extra.element.setAttribute('data-nav', 'true');
    container.appendChild(extra.element);

    // querySelectorAll finds [cards[0], cards[1], extra]; only extra is an "extra"
    // Navigation: j from cards[0] → cards[1], j from cards[1] → extra
    const firstJ = createContainerEvent('j', cards[0].element, container);
    act(() => {
      hook.result.current.onListKeyDown(firstJ);
    });
    expect(cards[1].focusSpy).toHaveBeenCalledTimes(1);
    expect(extra.focusSpy).not.toHaveBeenCalled();

    const secondJ = createContainerEvent('j', cards[1].element, container);
    act(() => {
      hook.result.current.onListKeyDown(secondJ);
    });
    expect(extra.focusSpy).toHaveBeenCalledTimes(1);
  });
});
