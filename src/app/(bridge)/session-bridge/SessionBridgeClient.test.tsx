import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSessionBridgeEarlyWindow,
  SESSION_BRIDGE_DISPATCH_KEY,
  SESSION_BRIDGE_PENDING_KEY,
} from '@/libs/session-bridge/early-listener';
import { installSessionBridgeListeners, resetSessionBridgeInstallForTests } from '@/libs/session-bridge/install';
import { asOpaque } from '@/test-utils/type-assertions';
import { SessionBridgeClient } from './SessionBridgeClient';

function setEmbedded(embedded: boolean): void {
  Object.defineProperty(window, 'top', {
    configurable: true,
    get: () => (embedded ? ({} as Window) : window),
  });
}

describe('SessionBridgeClient', () => {
  beforeEach(() => {
    resetSessionBridgeInstallForTests();
    window.localStorage.clear();
    const early = getSessionBridgeEarlyWindow();
    delete early[SESSION_BRIDGE_DISPATCH_KEY];
    delete early[SESSION_BRIDGE_PENDING_KEY];
    setEmbedded(true);
  });

  afterEach(() => {
    resetSessionBridgeInstallForTests();
    setEmbedded(false);
  });

  it('does not attach message or storage listeners on a top-level visit', () => {
    setEmbedded(false);
    const addSpy = vi.spyOn(window, 'addEventListener');

    render(<SessionBridgeClient />);

    expect(screen.getByText(/approved Pubky apps reuse your session/)).toBeInTheDocument();
    const types = addSpy.mock.calls.map((call) => call[0]);
    expect(types).not.toContain('message');
    expect(types).not.toContain('storage');
    addSpy.mockRestore();
  });

  it('removes the storage listener on cleanup', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const view = render(<SessionBridgeClient />);
    view.unmount();

    expect(removeSpy.mock.calls.some((call) => String(call[0]) === 'storage')).toBe(true);
    removeSpy.mockRestore();
  });
});

describe('installSessionBridgeListeners', () => {
  beforeEach(() => {
    resetSessionBridgeInstallForTests();
    window.localStorage.clear();
    const early = getSessionBridgeEarlyWindow();
    delete early[SESSION_BRIDGE_DISPATCH_KEY];
    delete early[SESSION_BRIDGE_PENDING_KEY];
    setEmbedded(true);
  });

  afterEach(() => {
    resetSessionBridgeInstallForTests();
    setEmbedded(false);
  });

  it('does not answer a request received before the listener exists, then answers after attach', () => {
    const source = { postMessage: vi.fn() };
    const request = new MessageEvent('message', {
      origin: 'https://vibes.pubky.app',
      data: { type: 'pubky-session-request', v: 1 },
      source: asOpaque<MessageEventSource>(source),
    });

    window.dispatchEvent(request);
    expect(source.postMessage).not.toHaveBeenCalled();

    const uninstall = installSessionBridgeListeners();
    window.dispatchEvent(request);
    expect(source.postMessage).toHaveBeenCalledTimes(1);

    uninstall();
  });

  it('replies once per queued retry and keeps a single storage subscriber', () => {
    const early = getSessionBridgeEarlyWindow();
    const pending: MessageEvent[] = [];
    early[SESSION_BRIDGE_PENDING_KEY] = pending;
    early[SESSION_BRIDGE_DISPATCH_KEY] = (event) => {
      pending.push(event);
    };

    const source = { postMessage: vi.fn() };
    const request = new MessageEvent('message', {
      origin: 'https://foo.vibes.pubky.app',
      data: { type: 'pubky-session-request', v: 1 },
      source: asOpaque<MessageEventSource>(source),
    });

    pending.push(request, request, request);

    const addSpy = vi.spyOn(window, 'addEventListener');
    const uninstall = installSessionBridgeListeners();

    expect(source.postMessage).toHaveBeenCalledTimes(3);
    expect(addSpy.mock.calls.filter((call) => String(call[0]) === 'storage')).toHaveLength(1);
    expect(addSpy.mock.calls.filter((call) => String(call[0]) === 'message')).toHaveLength(0);

    addSpy.mockRestore();
    uninstall();
  });
});
