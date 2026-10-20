import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installShopFrameHistory, type ShopFrameSnapshot } from './frame-history';

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

// Execute the installed Next history integration unchanged, without importing
// its bundler-only RSC graph. The route reducer is the controlled boundary here.
function installNextHistory(child: Window) {
  const require = createRequire(import.meta.url);
  const source = readFileSync(require.resolve('next/dist/client/components/app-router'), 'utf8');
  const copyStart = source.indexOf('function copyNextJsInternalHistoryState(');
  const copyEnd = source.indexOf('function Head(', copyStart);
  const effectStart = source.indexOf('    (0, _react.useEffect)(()=>{\n        const originalPushState');
  const effectEnd = source.indexOf('    }, []);', effectStart) + '    }, []);'.length;
  expect(copyStart).toBeGreaterThan(-1);
  expect(effectStart).toBeGreaterThan(-1);
  const traverse = vi.fn();
  const updateUrl = vi.fn();
  let dispose = () => {};
  runInNewContext(source.slice(copyStart, copyEnd) + source.slice(effectStart, effectEnd), {
    window: child,
    URL,
    _react: {
      useEffect: (run: () => () => void) => {
        dispose = run();
      },
      startTransition: (run: () => void) => run(),
    },
    _routerreducertypes: { ACTION_RESTORE: 'restore' },
    _useactionqueue: { dispatchAppRouterAction: updateUrl },
    _approuterinstance: { dispatchTraverseAction: traverse },
  });
  return { dispose: () => dispose(), traverse, updateUrl };
}

describe('Shop frame history ownership', () => {
  it.each(['before', 'after'])(
    'restores captured Next router state when its wrapper installs %s the adapter',
    (order) => {
      const catalogState = {
        __NA: true,
        __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: ['catalog'], renderedSearch: '' },
        custom: 'catalog',
      };
      const listingState = {
        __NA: true,
        __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: ['listing'], renderedSearch: '' },
        custom: 'listing',
      };
      frameWindow.history.replaceState(catalogState, '', '/shop-embed/marketplace');
      const firstNext = order === 'before' ? installNextHistory(frameWindow) : null;
      const onNavigate = vi.fn();
      let saved: ShopFrameSnapshot | null = null;
      const adapter = installShopFrameHistory(frameWindow, onNavigate, () => {
        saved = adapter.capture();
      });
      const next = firstNext ?? installNextHistory(frameWindow);
      cleanup = () => {
        adapter.dispose();
        next.dispose();
      };
      const document = frameWindow.document;
      frameWindow.history.pushState(listingState, '', '/shop-embed/marketplace/listing/test/item');
      expect(saved).not.toBeNull();
      const navigateCalls = onNavigate.mock.calls.length;

      expect(adapter.restore(saved!)).toBe(true);

      expect(frameWindow.document).toBe(document);
      expect(frameWindow.history.state).toEqual(catalogState);
      expect(frameWindow.location.pathname).toBe('/shop-embed/marketplace');
      expect(next.traverse).toHaveBeenCalledExactlyOnceWith(
        frameWindow.location.href,
        catalogState.__PRIVATE_NEXTJS_INTERNALS_TREE,
      );
      expect(next.updateUrl).not.toHaveBeenCalled();
      expect(onNavigate).toHaveBeenCalledTimes(navigateCalls);
    },
  );

  it('disposes safely after its WindowProxy becomes inaccessible', () => {
    let inaccessible = false;
    const proxy = new Proxy(frameWindow, {
      get(target, key) {
        if (inaccessible) throw new DOMException('Cross-origin access', 'SecurityError');
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    frameWindow.history.replaceState({ __NA: true }, '', '/shop-embed/marketplace');
    vi.spyOn(frameWindow, 'requestAnimationFrame').mockReturnValue(1);
    const cancel = vi.spyOn(frameWindow, 'cancelAnimationFrame');
    const originalPush = frameWindow.history.pushState;
    const adapter = installShopFrameHistory(proxy, vi.fn());
    cleanup = adapter.dispose;
    adapter.restore(adapter.capture()!);
    adapter.restoreScroll();
    inaccessible = true;
    expect(adapter.dispose).not.toThrow();
    expect(cancel).toHaveBeenCalledWith(1);
    expect(frameWindow.history.pushState).toBe(originalPush);
  });

  it('refuses live traversal with non-Next state or a replaced WindowProxy document', () => {
    let changed = false;
    const proxy = new Proxy(frameWindow, {
      get(target, key) {
        if (key === 'document' && changed) return document;
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const adapter = installShopFrameHistory(proxy, vi.fn());
    cleanup = adapter.dispose;
    expect(adapter.restore(adapter.capture()!)).toBe(false);
    frameWindow.history.replaceState({ __NA: true }, '', '/shop-embed/marketplace');
    const saved = adapter.capture()!;
    changed = true;
    expect(adapter.restore(saved)).toBe(false);
  });

  it('cancels a pending scroll restoration when another traversal starts or the frame is disposed', () => {
    frameWindow.history.replaceState({ __NA: true }, '', '/shop-embed/marketplace');
    const cancel = vi.spyOn(frameWindow, 'cancelAnimationFrame');
    const adapter = installShopFrameHistory(frameWindow, vi.fn());
    cleanup = adapter.dispose;
    const first = adapter.capture()!;
    frameWindow.history.pushState({ __NA: true }, '', '/shop-embed/marketplace/cart');
    const second = adapter.capture()!;
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(frameWindow, 'requestAnimationFrame').mockImplementation((run) => callbacks.push(run));
    const scroll = vi.spyOn(frameWindow, 'scrollTo').mockImplementation(() => {});
    adapter.restore(first);
    adapter.restoreScroll();
    adapter.restore(second);
    callbacks[0](0);
    expect(scroll).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledWith(1);
    adapter.restoreScroll();
    adapter.dispose();
    callbacks[1](0);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('stops waiting after its finite scroll budget when the restored page stays shorter', () => {
    frameWindow.history.replaceState({ __NA: true }, '', '/shop-embed/marketplace');
    Object.defineProperty(frameWindow, 'scrollY', { configurable: true, value: 2000 });
    vi.spyOn(frameWindow.performance, 'now').mockReturnValue(0);
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(frameWindow, 'requestAnimationFrame').mockImplementation((run) => callbacks.push(run));
    const scroll = vi.spyOn(frameWindow, 'scrollTo').mockImplementation(() => {});
    const adapter = installShopFrameHistory(frameWindow, vi.fn());
    cleanup = adapter.dispose;
    adapter.restore(adapter.capture()!);
    adapter.restoreScroll();
    callbacks[0](0);
    expect(scroll).not.toHaveBeenCalled();
    callbacks[1](1000);
    expect(scroll).toHaveBeenCalledExactlyOnceWith(0, 2000);
    expect(callbacks).toHaveLength(2);
  });

  it.each(['wheel', 'touchstart', 'pointerdown', 'keydown'])('cancels delayed restoration for %s input', (event) => {
    frameWindow.history.replaceState({ __NA: true }, '', '/shop-embed/marketplace');
    Object.defineProperty(frameWindow, 'scrollY', { configurable: true, value: 2000 });
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(frameWindow, 'requestAnimationFrame').mockImplementation((run) => callbacks.push(run));
    const cancel = vi.spyOn(frameWindow, 'cancelAnimationFrame');
    const scroll = vi.spyOn(frameWindow, 'scrollTo').mockImplementation(() => {});
    const adapter = installShopFrameHistory(frameWindow, vi.fn());
    cleanup = adapter.dispose;
    adapter.restore(adapter.capture()!);
    adapter.restoreScroll();
    callbacks[0](0);
    Object.defineProperty(frameWindow, 'scrollY', { configurable: true, value: 120 });
    frameWindow.dispatchEvent(new Event(event));
    callbacks[1](16);
    expect(scroll).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledWith(2);
    expect(adapter.capture()?.scroll.y).toBe(120);
  });

  it('drops a delayed scroll target when the child changes path before content is ready', () => {
    frameWindow.history.replaceState({ __NA: true }, '', '/shop-embed/marketplace');
    Object.defineProperty(frameWindow, 'scrollY', { configurable: true, value: 2000 });
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(frameWindow, 'requestAnimationFrame').mockImplementation((run) => callbacks.push(run));
    const scroll = vi.spyOn(frameWindow, 'scrollTo').mockImplementation(() => {});
    const adapter = installShopFrameHistory(frameWindow, vi.fn());
    cleanup = adapter.dispose;
    adapter.restore(adapter.capture()!);
    adapter.restoreScroll();
    callbacks[0](0);
    Object.defineProperty(frameWindow, 'scrollY', { configurable: true, value: 0 });
    frameWindow.history.replaceState({ __NA: true }, '', '/shop-embed/marketplace/cart');
    callbacks[1](16);
    frameWindow.history.replaceState({ __NA: true }, '', '/shop-embed/marketplace');
    expect(scroll).not.toHaveBeenCalled();
    expect(adapter.capture()?.scroll.y).toBe(0);
  });

  it.each(['prevented', 'modified', 'download', 'new-tab', 'different-path'])(
    'leaves %s anchor clicks to their existing handler',
    (kind) => {
      const adapter = installShopFrameHistory(frameWindow, vi.fn());
      cleanup = adapter.dispose;
      frameWindow.document.append(frameWindow.document.createElement('html'));
      const anchor = frameWindow.document.createElement('a');
      anchor.href = kind === 'different-path' ? '/shop-embed/marketplace/cart#details' : '#details';
      if (kind === 'download') anchor.download = '';
      if (kind === 'new-tab') anchor.target = '_blank';
      frameWindow.document.documentElement.append(anchor);
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: kind === 'modified' });
      if (kind === 'prevented') event.preventDefault();
      // Suppress jsdom's asynchronous navigation after observing adapter behavior.
      frameWindow.addEventListener('click', (seen) => {
        expect(seen.defaultPrevented).toBe(kind === 'prevented');
        seen.preventDefault();
      });
      anchor.dispatchEvent(event);
      expect(frameWindow.location.hash).toBe('');
    },
  );

  it('replaces the child entry while reporting push intent and retaining Next history state', () => {
    const history = frameWindow.history;
    const length = history.length;
    const push = vi.spyOn(history, 'pushState');
    const replace = vi.spyOn(history, 'replaceState');
    const onNavigate = vi.fn();
    const state = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: ['shop', 'listing'] }, custom: 'retained' };
    cleanup = installShopFrameHistory(frameWindow, onNavigate).dispose;

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
    cleanup = installShopFrameHistory(frameWindow, onNavigate).dispose;

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
    cleanup = installShopFrameHistory(frameWindow, onNavigate).dispose;

    frameWindow.history.pushState(null, '', url);

    expect(onNavigate).toHaveBeenCalledExactlyOnceWith(path, 'push');
  });

  it.each([undefined, null])('preserves an explicit %s URL argument', (url) => {
    const replace = vi.spyOn(frameWindow.history, 'replaceState');
    const onNavigate = vi.fn();
    cleanup = installShopFrameHistory(frameWindow, onNavigate).dispose;

    frameWindow.history.pushState({ unchanged: true }, 'title', url);

    expect(replace.mock.calls).toEqual([[{ unchanged: true }, 'title', url]]);
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('/shop-embed/marketplace', 'push');
  });

  it('preserves an omitted URL argument', () => {
    const replace = vi.spyOn(frameWindow.history, 'replaceState');
    const onNavigate = vi.fn();
    cleanup = installShopFrameHistory(frameWindow, onNavigate).dispose;

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
      cleanup = installShopFrameHistory(frameWindow, onNavigate).dispose;

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
    cleanup = installShopFrameHistory(frameWindow, onNavigate).dispose;

    history.pushState(null, '', '/outside');
    history.pushState(null, '', '/shop-embed/marketplace/cart');

    expect(history.length).toBe(length + 2);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('does not report out-of-mount replacements', () => {
    const onNavigate = vi.fn();
    cleanup = installShopFrameHistory(frameWindow, onNavigate).dispose;

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
    cleanup = installShopFrameHistory(frameWindow, onNavigate).dispose;

    history.pushState(null, '', 'destination');

    expect(frameWindow.location.pathname).toBe('/outside/destination');
    expect(history.length).toBe(length + 1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('retains native cross-origin errors without reporting a successful navigation', () => {
    const onNavigate = vi.fn();
    cleanup = installShopFrameHistory(frameWindow, onNavigate).dispose;

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
    cleanup = installShopFrameHistory(frameWindow, onNavigate).dispose;

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
      cleanup = installShopFrameHistory(frameWindow, onNavigate).dispose;

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
    cleanup = installShopFrameHistory(frameWindow, onNavigate).dispose;

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
    cleanup = installShopFrameHistory(frameWindow, onNavigate).dispose;
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
    cleanup = installShopFrameHistory(proxy, onNavigate).dispose;
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
    cleanup = installShopFrameHistory(frameWindow, vi.fn()).dispose;

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
    cleanup = installShopFrameHistory(proxy, vi.fn()).dispose;

    expect(history.pushState).toBe(originalPush);
    expect(cleanup).not.toThrow();
  });
});
