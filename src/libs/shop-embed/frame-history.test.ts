import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installShopFrameHistory } from './frame-history';

let frame: HTMLIFrameElement;
let frameWindow: Window;
let cleanup: (() => void) | undefined;

beforeEach(() => {
  frame = document.createElement('iframe');
  frame.src = `${window.location.origin}/shop-embed/marketplace`;
  document.body.appendChild(frame);
  frameWindow = frame.contentWindow!;
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.restoreAllMocks();
  frame.remove();
});

describe('Shop frame history ownership', () => {
  it('replaces the child entry while reporting push intent and retaining Next history state', () => {
    const history = frameWindow.history;
    const length = history.length;
    const push = vi.spyOn(history, 'pushState');
    const replace = vi.spyOn(history, 'replaceState');
    const onNavigate = vi.fn();
    const state = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: ['shop', 'listing'] }, custom: 'retained' };
    cleanup = installShopFrameHistory(frameWindow, onNavigate);

    history.pushState(state, 'listing', '/shop-embed/marketplace/listing/seller/item?variant=blue#details');

    expect(push).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledExactlyOnceWith(
      state,
      'listing',
      '/shop-embed/marketplace/listing/seller/item?variant=blue#details',
    );
    expect(replace.mock.contexts).toEqual([history]);
    expect(history.length).toBe(length);
    expect(history.state).toEqual(state);
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith(
      '/shop-embed/marketplace/listing/seller/item?variant=blue#details',
      'push',
    );
  });

  it('retains replacement intent for checkout order hashes', () => {
    const history = frameWindow.history;
    const length = history.length;
    const onNavigate = vi.fn();
    cleanup = installShopFrameHistory(frameWindow, onNavigate);

    history.replaceState({ order: 'test-order' }, '', '/shop-embed/marketplace/checkout#test-order');

    expect(history.length).toBe(length);
    expect(history.state).toEqual({ order: 'test-order' });
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('/shop-embed/marketplace/checkout#test-order', 'replace');
  });

  it.each([
    ['?category=books#results', '/shop-embed/marketplace?category=books#results'],
    ['#details', '/shop-embed/marketplace#details'],
    [new URL('/shop-embed/marketplace/cart', window.location.origin), '/shop-embed/marketplace/cart'],
  ])('reports the actual resolved URL for %s', (url, path) => {
    const onNavigate = vi.fn();
    cleanup = installShopFrameHistory(frameWindow, onNavigate);

    frameWindow.history.pushState(null, '', url);

    expect(onNavigate).toHaveBeenCalledExactlyOnceWith(path, 'push');
  });

  it.each([undefined, null])('preserves an explicit %s URL argument', (url) => {
    const replace = vi.spyOn(frameWindow.history, 'replaceState');
    const onNavigate = vi.fn();
    cleanup = installShopFrameHistory(frameWindow, onNavigate);

    frameWindow.history.pushState({ unchanged: true }, 'title', url);

    expect(replace.mock.calls).toEqual([[{ unchanged: true }, 'title', url]]);
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('/shop-embed/marketplace', 'push');
  });

  it('preserves an omitted URL argument', () => {
    const replace = vi.spyOn(frameWindow.history, 'replaceState');
    const onNavigate = vi.fn();
    cleanup = installShopFrameHistory(frameWindow, onNavigate);

    frameWindow.history.pushState(null, 'title');

    expect(replace.mock.calls).toEqual([[null, 'title']]);
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('/shop-embed/marketplace', 'push');
  });

  it.each(['/outside', '/shop-embed/api/session', '/shop-embed/_next/static/file', '/shop-embed/%2foutside'])(
    'leaves native push behavior intact for %s',
    (path) => {
      const history = frameWindow.history;
      const length = history.length;
      const push = vi.spyOn(history, 'pushState');
      const replace = vi.spyOn(history, 'replaceState');
      const onNavigate = vi.fn();
      cleanup = installShopFrameHistory(frameWindow, onNavigate);

      history.pushState({ native: true }, '', path);

      expect(push).toHaveBeenCalledExactlyOnceWith({ native: true }, '', path);
      expect(replace).not.toHaveBeenCalled();
      expect(history.length).toBe(length + 1);
      expect(onNavigate).not.toHaveBeenCalled();
    },
  );

  it('stops intercepting after the document leaves the Shop mount', () => {
    const history = frameWindow.history;
    const length = history.length;
    const onNavigate = vi.fn();
    cleanup = installShopFrameHistory(frameWindow, onNavigate);

    history.pushState(null, '', '/outside');
    history.pushState(null, '', '/shop-embed/marketplace/cart');

    expect(history.length).toBe(length + 2);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('does not report out-of-mount replacements', () => {
    const onNavigate = vi.fn();
    cleanup = installShopFrameHistory(frameWindow, onNavigate);

    frameWindow.history.replaceState(null, '', '/outside');
    frameWindow.history.replaceState(null, '', '/shop-embed/marketplace/cart');

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('uses the document base URL when deciding whether a relative destination belongs to Shop', () => {
    const base = frameWindow.document.createElement('base');
    base.href = `${window.location.origin}/outside/`;
    const html = frameWindow.document.createElement('html');
    const head = frameWindow.document.createElement('head');
    frameWindow.document.appendChild(html);
    html.appendChild(head);
    head.appendChild(base);
    const history = frameWindow.history;
    const length = history.length;
    const onNavigate = vi.fn();
    cleanup = installShopFrameHistory(frameWindow, onNavigate);

    history.pushState(null, '', 'destination');

    expect(frameWindow.location.pathname).toBe('/outside/destination');
    expect(history.length).toBe(length + 1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('retains native cross-origin errors without reporting a successful navigation', () => {
    const onNavigate = vi.fn();
    cleanup = installShopFrameHistory(frameWindow, onNavigate);

    expect(() => frameWindow.history.pushState(null, '', 'https://elsewhere.test/shop-embed/marketplace')).toThrow();
    expect(frameWindow.location.pathname).toBe('/shop-embed/marketplace');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('does not report or fall back to a push if the existing replacement fails', () => {
    const failure = new DOMException('The document is no longer active', 'SecurityError');
    vi.spyOn(frameWindow.history, 'replaceState').mockImplementation(() => {
      throw failure;
    });
    const push = vi.spyOn(frameWindow.history, 'pushState');
    const onNavigate = vi.fn();
    cleanup = installShopFrameHistory(frameWindow, onNavigate);

    expect(() => frameWindow.history.pushState(null, '', '/shop-embed/marketplace/cart')).toThrow(failure);
    expect(push).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('preserves the receiver when its method is borrowed by another history object', () => {
    const otherFrame = document.createElement('iframe');
    otherFrame.src = `${window.location.origin}/shop-embed/marketplace`;
    document.body.appendChild(otherFrame);
    try {
      const otherWindow = otherFrame.contentWindow!;
      const length = otherWindow.history.length;
      const onNavigate = vi.fn();
      cleanup = installShopFrameHistory(frameWindow, onNavigate);

      frameWindow.history.pushState.call(otherWindow.history, null, '', '/shop-embed/marketplace/cart');

      expect(otherWindow.location.pathname).toBe('/shop-embed/marketplace/cart');
      expect(otherWindow.history.length).toBe(length + 1);
      expect(frameWindow.location.pathname).toBe('/shop-embed/marketplace');
      expect(onNavigate).not.toHaveBeenCalled();
    } finally {
      otherFrame.remove();
    }
  });

  it('restores its own methods and makes cleanup idempotent', () => {
    const history = frameWindow.history;
    const originalPush = history.pushState;
    const originalReplace = history.replaceState;
    const onNavigate = vi.fn();
    cleanup = installShopFrameHistory(frameWindow, onNavigate);

    cleanup();
    cleanup();

    expect(history.pushState).toBe(originalPush);
    expect(history.replaceState).toBe(originalReplace);
    const length = history.length;
    history.pushState(null, '', '/shop-embed/marketplace/cart');
    expect(history.length).toBe(length + 1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('does not clobber a later Next wrapper or keep changing history through its captured method', () => {
    const history = frameWindow.history;
    const onNavigate = vi.fn();
    cleanup = installShopFrameHistory(frameWindow, onNavigate);
    const capturedPush = history.pushState;
    const capturedReplace = history.replaceState;
    const laterPush: History['pushState'] = function (this: History, ...args) {
      return capturedPush.apply(this, args);
    };
    const laterReplace: History['replaceState'] = function (this: History, ...args) {
      return capturedReplace.apply(this, args);
    };
    history.pushState = laterPush;
    history.replaceState = laterReplace;

    cleanup();

    expect(history.pushState).toBe(laterPush);
    expect(history.replaceState).toBe(laterReplace);
    const length = history.length;
    history.pushState(null, '', '/shop-embed/marketplace/cart');
    expect(history.length).toBe(length + 1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('stops intercepting if the WindowProxy now exposes a different document', () => {
    let documentChanged = false;
    const proxy = new Proxy(frameWindow, {
      get(target, key) {
        if (key === 'document' && documentChanged) return document;
        return Reflect.get(target, key, target);
      },
    });
    const onNavigate = vi.fn();
    cleanup = installShopFrameHistory(proxy, onNavigate);
    const length = frameWindow.history.length;
    documentChanged = true;

    frameWindow.history.pushState(null, '', '/shop-embed/marketplace/cart');

    expect(frameWindow.history.length).toBe(length + 1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('does not install into a document outside the Shop mount', () => {
    frameWindow.history.replaceState(null, '', '/outside');
    const history = frameWindow.history;
    const originalPush = history.pushState;
    const originalReplace = history.replaceState;
    cleanup = installShopFrameHistory(frameWindow, vi.fn());

    expect(history.pushState).toBe(originalPush);
    expect(history.replaceState).toBe(originalReplace);
  });

  it('leaves inaccessible frame windows alone', () => {
    const proxy = new Proxy(frameWindow, {
      get(target, key) {
        if (key === 'location') throw new DOMException('Cross-origin access', 'SecurityError');
        return Reflect.get(target, key, target);
      },
    });
    const history = frameWindow.history;
    const originalPush = history.pushState;
    cleanup = installShopFrameHistory(proxy, vi.fn());

    expect(history.pushState).toBe(originalPush);
    expect(cleanup).not.toThrow();
  });
});
