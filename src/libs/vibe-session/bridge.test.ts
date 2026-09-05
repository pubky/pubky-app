import { afterEach, describe, expect, it, vi } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import { requestFromBridge } from './bridge';
import { PUBKY_SESSION_BRIDGE_VERSION, PUBKY_SESSION_REQUEST_TYPE } from './types';

const BRIDGE = 'https://pubky.app';
const EXPORT = 'session-export-value';

type FakeContentWindow = Window & { postMessage: ReturnType<typeof vi.fn> };

let restoreCreateElement: (() => void) | undefined;

function installIframeStub(
  win: Window,
  stub?: { contentWindowNull?: boolean; skipLoad?: boolean; fireError?: boolean; delayedLoadMs?: number },
) {
  restoreCreateElement?.();
  const originalCreate = win.document.createElement.bind(win.document);
  const fakeContent = asOpaque<FakeContentWindow>({
    postMessage: vi.fn(),
  });
  const created: HTMLIFrameElement[] = [];

  win.document.createElement = ((tagName: string, createOptions?: ElementCreationOptions) => {
    if (tagName.toLowerCase() !== 'iframe') {
      return originalCreate(tagName, createOptions);
    }
    const iframe = originalCreate('iframe') as HTMLIFrameElement;
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      get: () => (stub?.contentWindowNull ? null : fakeContent),
    });
    created.push(iframe);
    if (stub?.delayedLoadMs != null) {
      setTimeout(() => iframe.dispatchEvent(new Event('load')), stub.delayedLoadMs);
    } else if (!stub?.skipLoad && !stub?.fireError) {
      queueMicrotask(() => iframe.dispatchEvent(new Event('load')));
    }
    if (stub?.fireError) {
      queueMicrotask(() => iframe.dispatchEvent(new Event('error')));
    }
    return iframe;
  }) as typeof win.document.createElement;

  restoreCreateElement = () => {
    win.document.createElement = originalCreate;
    restoreCreateElement = undefined;
  };

  return { fakeContent, created };
}

function dispatchBridgeMessage(win: Window, source: MessageEventSource | null, origin: string, data: unknown) {
  const event = new MessageEvent('message', { data, origin, source });
  win.dispatchEvent(event);
}

afterEach(() => {
  restoreCreateElement?.();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('requestFromBridge', () => {
  it('accepts a valid bridge reply from the iframe origin and source', async () => {
    const { fakeContent, created } = installIframeStub(window);
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const pending = requestFromBridge(window, BRIDGE, 15000, 3000);
    await vi.waitFor(() =>
      expect(fakeContent.postMessage).toHaveBeenCalledWith(
        { type: PUBKY_SESSION_REQUEST_TYPE, v: PUBKY_SESSION_BRIDGE_VERSION },
        BRIDGE,
      ),
    );
    dispatchBridgeMessage(window, fakeContent, BRIDGE, {
      type: 'pubky-session',
      v: 1,
      sessionExport: EXPORT,
    });
    const result = await pending;
    expect(result).toEqual({ kind: 'export', sessionExport: EXPORT });
    expect(created.every((el) => !el.isConnected)).toBe(true);
    expect(document.querySelector('iframe')).toBeNull();
    expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('ignores a wrong origin then accepts the correct origin', async () => {
    const { fakeContent } = installIframeStub(window);
    const pending = requestFromBridge(window, BRIDGE, 15000, 3000);
    await vi.waitFor(() => expect(fakeContent.postMessage).toHaveBeenCalled());
    dispatchBridgeMessage(window, fakeContent, 'https://evil.example', {
      type: 'pubky-session',
      v: 1,
      sessionExport: 'evil',
    });
    dispatchBridgeMessage(window, fakeContent, BRIDGE, {
      type: 'pubky-session',
      v: 1,
      sessionExport: EXPORT,
    });
    await expect(pending).resolves.toEqual({ kind: 'export', sessionExport: EXPORT });
  });

  it('ignores a correct origin with the wrong source until reply timeout', async () => {
    const { fakeContent } = installIframeStub(window);
    const pending = requestFromBridge(window, BRIDGE, 15000, 50);
    await vi.waitFor(() => expect(fakeContent.postMessage).toHaveBeenCalled());
    const impostor = asOpaque<Window>({ postMessage: vi.fn() });
    dispatchBridgeMessage(window, impostor, BRIDGE, {
      type: 'pubky-session',
      v: 1,
      sessionExport: EXPORT,
    });
    await expect(pending).resolves.toEqual({ kind: 'timeout', phase: 'reply' });
  });

  it('returns none on pubky-session-none', async () => {
    const { fakeContent } = installIframeStub(window);
    const pending = requestFromBridge(window, BRIDGE, 15000, 3000);
    await vi.waitFor(() => expect(fakeContent.postMessage).toHaveBeenCalled());
    dispatchBridgeMessage(window, fakeContent, BRIDGE, { type: 'pubky-session-none', v: 1 });
    await expect(pending).resolves.toEqual({ kind: 'none' });
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('returns timeout phase load when load never fires', async () => {
    vi.useFakeTimers();
    installIframeStub(window, { skipLoad: true });
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const pending = requestFromBridge(window, BRIDGE, 1000, 50);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual({ kind: 'timeout', phase: 'load' });
    expect(document.querySelector('iframe')).toBeNull();
    expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('succeeds when load is slower than the reply timeout but within the load timeout', async () => {
    vi.useFakeTimers();
    const { fakeContent } = installIframeStub(window, { delayedLoadMs: 400 });
    const pending = requestFromBridge(window, BRIDGE, 5000, 100);
    await vi.advanceTimersByTimeAsync(400);
    expect(fakeContent.postMessage).toHaveBeenCalled();
    dispatchBridgeMessage(window, fakeContent, BRIDGE, {
      type: 'pubky-session',
      v: 1,
      sessionExport: EXPORT,
    });
    await expect(pending).resolves.toEqual({ kind: 'export', sessionExport: EXPORT });
  });

  it('returns timeout phase reply measured from load', async () => {
    vi.useFakeTimers();
    const { fakeContent, created } = installIframeStub(window, { skipLoad: true });
    const pending = requestFromBridge(window, BRIDGE, 5000, 1000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fakeContent.postMessage).not.toHaveBeenCalled();
    created[0]?.dispatchEvent(new Event('load'));
    expect(fakeContent.postMessage).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(999);
    expect(document.querySelector('iframe')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ kind: 'timeout', phase: 'reply' });
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('posts the request and arms the reply timer only once across two load events', async () => {
    vi.useFakeTimers();
    const { fakeContent, created } = installIframeStub(window, { skipLoad: true });
    const pending = requestFromBridge(window, BRIDGE, 5000, 100);
    created[0]?.dispatchEvent(new Event('load'));
    created[0]?.dispatchEvent(new Event('load'));
    expect(fakeContent.postMessage).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toEqual({ kind: 'timeout', phase: 'reply' });
  });

  it('returns aborted, not unavailable, when already aborted and document is unusable', async () => {
    const ac = new AbortController();
    ac.abort();
    const brokenWindow = { document: {} } as Window;
    await expect(requestFromBridge(brokenWindow, BRIDGE, 1000, 1000, ac.signal)).resolves.toEqual({
      kind: 'aborted',
    });
  });

  it('aborts before load and cleans up listeners, iframe, and timers', async () => {
    vi.useFakeTimers();
    const ac = new AbortController();
    const { created } = installIframeStub(window, { skipLoad: true });
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const pending = requestFromBridge(window, BRIDGE, 15000, 3000, ac.signal);
    expect(created.length).toBe(1);
    ac.abort();
    await expect(pending).resolves.toEqual({ kind: 'aborted' });
    expect(document.querySelector('iframe')).toBeNull();
    expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts after load and cleans up listeners, iframe, and timers', async () => {
    vi.useFakeTimers();
    const ac = new AbortController();
    const { fakeContent } = installIframeStub(window);
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const pending = requestFromBridge(window, BRIDGE, 15000, 3000, ac.signal);
    await vi.advanceTimersByTimeAsync(0);
    expect(fakeContent.postMessage).toHaveBeenCalled();
    ac.abort();
    await expect(pending).resolves.toEqual({ kind: 'aborted' });
    expect(document.querySelector('iframe')).toBeNull();
    expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns unavailable when contentWindow is null', async () => {
    installIframeStub(window, { contentWindowNull: true });
    await expect(requestFromBridge(window, BRIDGE, 15000, 3000)).resolves.toMatchObject({
      kind: 'unavailable',
    });
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('returns unavailable when the iframe fires error', async () => {
    installIframeStub(window, { fireError: true });
    await expect(requestFromBridge(window, BRIDGE, 15000, 3000)).resolves.toMatchObject({
      kind: 'unavailable',
    });
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('ignores a late push after finish', async () => {
    const { fakeContent } = installIframeStub(window);
    const pending = requestFromBridge(window, BRIDGE, 15000, 3000);
    await vi.waitFor(() => expect(fakeContent.postMessage).toHaveBeenCalled());
    dispatchBridgeMessage(window, fakeContent, BRIDGE, {
      type: 'pubky-session',
      v: 1,
      sessionExport: EXPORT,
    });
    const result = await pending;
    expect(result).toEqual({ kind: 'export', sessionExport: EXPORT });
    dispatchBridgeMessage(window, fakeContent, BRIDGE, {
      type: 'pubky-session',
      v: 1,
      sessionExport: 'late-export',
    });
    expect(result).toEqual({ kind: 'export', sessionExport: EXPORT });
  });

  it('ignores v !== 1 and empty sessionExport until timeout', async () => {
    const { fakeContent } = installIframeStub(window);
    const pending = requestFromBridge(window, BRIDGE, 15000, 50);
    await vi.waitFor(() => expect(fakeContent.postMessage).toHaveBeenCalled());
    dispatchBridgeMessage(window, fakeContent, BRIDGE, {
      type: 'pubky-session',
      v: 2,
      sessionExport: EXPORT,
    });
    dispatchBridgeMessage(window, fakeContent, BRIDGE, {
      type: 'pubky-session',
      v: 1,
      sessionExport: '',
    });
    dispatchBridgeMessage(window, fakeContent, BRIDGE, {
      type: 'pubky-session',
      v: 1,
      sessionExport: 12,
    });
    await expect(pending).resolves.toEqual({ kind: 'timeout', phase: 'reply' });
  });

  it('does not cross-deliver replies across concurrent requests', async () => {
    const originalCreate = window.document.createElement.bind(window.document);
    const contents: FakeContentWindow[] = [];
    window.document.createElement = ((tagName: string, createOptions?: ElementCreationOptions) => {
      if (tagName.toLowerCase() !== 'iframe') {
        return originalCreate(tagName, createOptions);
      }
      const iframe = originalCreate('iframe') as HTMLIFrameElement;
      const fakeContent = asOpaque<FakeContentWindow>({ postMessage: vi.fn() });
      contents.push(fakeContent);
      Object.defineProperty(iframe, 'contentWindow', {
        configurable: true,
        get: () => fakeContent,
      });
      queueMicrotask(() => iframe.dispatchEvent(new Event('load')));
      return iframe;
    }) as typeof window.document.createElement;
    restoreCreateElement = () => {
      window.document.createElement = originalCreate;
      restoreCreateElement = undefined;
    };

    const pendingA = requestFromBridge(window, BRIDGE, 15000, 3000);
    await vi.waitFor(() => expect(contents[0]?.postMessage).toHaveBeenCalled());
    const pendingB = requestFromBridge(window, BRIDGE, 15000, 3000);
    await vi.waitFor(() => expect(contents[1]?.postMessage).toHaveBeenCalled());
    dispatchBridgeMessage(window, contents[0], BRIDGE, {
      type: 'pubky-session',
      v: 1,
      sessionExport: 'export-a',
    });
    dispatchBridgeMessage(window, contents[1], BRIDGE, {
      type: 'pubky-session',
      v: 1,
      sessionExport: 'export-b',
    });
    const [a, b] = await Promise.all([pendingA, pendingB]);
    expect(a).toEqual({ kind: 'export', sessionExport: 'export-a' });
    expect(b).toEqual({ kind: 'export', sessionExport: 'export-b' });
  });
});
