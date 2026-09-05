import { describe, expect, it, vi } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import { createSessionBridgeHandler } from './handler';
import { parsePersistedAuthStoreValue } from './persisted-session';

const allowlist = ['https://vibes.pubky.app', 'https://*.vibes.pubky.app', 'http://localhost:3000'];

function persisted(sessionExport: string | null): string {
  return JSON.stringify({
    state: { sessionExport, currentUserPubky: sessionExport ? 'pk' : null, hasProfile: false, hasHydrated: false },
    version: 0,
  });
}

describe('createSessionBridgeHandler', () => {
  it('replies to an allowlisted request with pubky-session when signed in', () => {
    const source = { postMessage: vi.fn() };
    const { handleMessage } = createSessionBridgeHandler({
      allowlist,
      getSessionExport: () => 'export-1',
    });

    handleMessage({
      origin: 'https://foo.vibes.pubky.app',
      source: asOpaque<MessageEventSource>(source),
      data: { type: 'pubky-session-request', v: 1 },
    });

    expect(source.postMessage).toHaveBeenCalledTimes(1);
    expect(source.postMessage).toHaveBeenCalledWith(
      { type: 'pubky-session', v: 1, sessionExport: 'export-1' },
      'https://foo.vibes.pubky.app',
    );
  });

  it('replies pubky-session-none when signed out', () => {
    const source = { postMessage: vi.fn() };
    const { handleMessage } = createSessionBridgeHandler({
      allowlist,
      getSessionExport: () => null,
    });

    handleMessage({
      origin: 'https://vibes.pubky.app',
      source: asOpaque<MessageEventSource>(source),
      data: { type: 'pubky-session-request', v: 1 },
    });

    expect(source.postMessage).toHaveBeenCalledWith({ type: 'pubky-session-none', v: 1 }, 'https://vibes.pubky.app');
  });

  it('ignores non-allowlisted origins', () => {
    const source = { postMessage: vi.fn() };
    const { handleMessage } = createSessionBridgeHandler({
      allowlist,
      getSessionExport: () => 'export-1',
    });

    handleMessage({
      origin: 'https://evil.example',
      source: asOpaque<MessageEventSource>(source),
      data: { type: 'pubky-session-request', v: 1 },
    });

    expect(source.postMessage).not.toHaveBeenCalled();
  });

  it('ignores the wrong message type', () => {
    const source = { postMessage: vi.fn() };
    const { handleMessage } = createSessionBridgeHandler({
      allowlist,
      getSessionExport: () => 'export-1',
    });

    handleMessage({
      origin: 'https://vibes.pubky.app',
      source: asOpaque<MessageEventSource>(source),
      data: { type: 'other', v: 1 },
    });

    expect(source.postMessage).not.toHaveBeenCalled();
  });

  it('ignores a null source', () => {
    const { handleMessage } = createSessionBridgeHandler({
      allowlist,
      getSessionExport: () => 'export-1',
    });

    expect(() =>
      handleMessage({
        origin: 'https://vibes.pubky.app',
        source: null,
        data: { type: 'pubky-session-request', v: 1 },
      }),
    ).not.toThrow();
  });

  it('pushes to the last valid requester on a matching storage event', () => {
    const source = { postMessage: vi.fn() };
    const { handleMessage, handleStorage } = createSessionBridgeHandler({
      allowlist,
      getSessionExport: () => 'export-1',
    });

    handleMessage({
      origin: 'https://foo.vibes.pubky.app',
      source: asOpaque<MessageEventSource>(source),
      data: { type: 'pubky-session-request', v: 1 },
    });
    source.postMessage.mockClear();

    handleStorage({ key: 'auth-store', newValue: persisted('export-2') });

    expect(source.postMessage).toHaveBeenCalledWith(
      { type: 'pubky-session', v: 1, sessionExport: 'export-2' },
      'https://foo.vibes.pubky.app',
    );
  });

  it('does not push a storage event when nobody has asked', () => {
    const { handleStorage } = createSessionBridgeHandler({
      allowlist,
      getSessionExport: () => 'export-1',
    });

    expect(() => handleStorage({ key: 'auth-store', newValue: persisted('export-2') })).not.toThrow();
  });

  it('parses storage payloads with the persisted-store parser', () => {
    expect(parsePersistedAuthStoreValue(persisted('export-2'))).toBe('export-2');
    expect(parsePersistedAuthStoreValue(persisted(null))).toBeNull();
  });

  it('ignores v mismatches including missing and string versions', () => {
    const source = { postMessage: vi.fn() };
    const { handleMessage } = createSessionBridgeHandler({
      allowlist,
      getSessionExport: () => 'export-1',
    });

    for (const data of [
      { type: 'pubky-session-request', v: 2 },
      { type: 'pubky-session-request' },
      { type: 'pubky-session-request', v: '1' },
    ]) {
      handleMessage({
        origin: 'https://vibes.pubky.app',
        source: asOpaque<MessageEventSource>(source),
        data,
      });
    }

    expect(source.postMessage).not.toHaveBeenCalled();
  });

  it('does not push storage events for an unrelated key', () => {
    const source = { postMessage: vi.fn() };
    const { handleMessage, handleStorage } = createSessionBridgeHandler({
      allowlist,
      getSessionExport: () => 'export-1',
    });

    handleMessage({
      origin: 'https://foo.vibes.pubky.app',
      source: asOpaque<MessageEventSource>(source),
      data: { type: 'pubky-session-request', v: 1 },
    });
    source.postMessage.mockClear();

    handleStorage({ key: 'theme-store', newValue: persisted('export-2') });

    expect(source.postMessage).not.toHaveBeenCalled();
  });

  it('pushes pubky-session-none when storage key is null', () => {
    const source = { postMessage: vi.fn() };
    const { handleMessage, handleStorage } = createSessionBridgeHandler({
      allowlist,
      getSessionExport: () => 'export-1',
    });

    handleMessage({
      origin: 'https://foo.vibes.pubky.app',
      source: asOpaque<MessageEventSource>(source),
      data: { type: 'pubky-session-request', v: 1 },
    });
    source.postMessage.mockClear();

    handleStorage({ key: null, newValue: null });

    expect(source.postMessage).toHaveBeenCalledWith(
      { type: 'pubky-session-none', v: 1 },
      'https://foo.vibes.pubky.app',
    );
  });

  it('storage-pushes only to the last of two allowlisted requesters', () => {
    const first = { postMessage: vi.fn() };
    const second = { postMessage: vi.fn() };
    const { handleMessage, handleStorage } = createSessionBridgeHandler({
      allowlist,
      getSessionExport: () => 'export-1',
    });

    handleMessage({
      origin: 'https://foo.vibes.pubky.app',
      source: asOpaque<MessageEventSource>(first),
      data: { type: 'pubky-session-request', v: 1 },
    });
    handleMessage({
      origin: 'https://vibes.pubky.app',
      source: asOpaque<MessageEventSource>(second),
      data: { type: 'pubky-session-request', v: 1 },
    });
    first.postMessage.mockClear();
    second.postMessage.mockClear();

    handleStorage({ key: 'auth-store', newValue: persisted('export-2') });

    expect(first.postMessage).not.toHaveBeenCalled();
    expect(second.postMessage).toHaveBeenCalledWith(
      { type: 'pubky-session', v: 1, sessionExport: 'export-2' },
      'https://vibes.pubky.app',
    );
  });

  it('ignores non-object request data', () => {
    const source = { postMessage: vi.fn() };
    const { handleMessage } = createSessionBridgeHandler({
      allowlist,
      getSessionExport: () => 'export-1',
    });

    handleMessage({
      origin: 'https://vibes.pubky.app',
      source: asOpaque<MessageEventSource>(source),
      data: 'pubky-session-request',
    });
    handleMessage({
      origin: 'https://vibes.pubky.app',
      source: asOpaque<MessageEventSource>(source),
      data: 1,
    });

    expect(source.postMessage).not.toHaveBeenCalled();
  });

  it('replies once per identical retry request with a single subscriber', () => {
    const source = { postMessage: vi.fn() };
    const { handleMessage, handleStorage } = createSessionBridgeHandler({
      allowlist,
      getSessionExport: () => 'export-1',
    });

    const request = {
      origin: 'https://foo.vibes.pubky.app',
      source: asOpaque<MessageEventSource>(source),
      data: { type: 'pubky-session-request', v: 1 },
    };

    handleMessage(request);
    handleMessage(request);
    handleMessage(request);

    expect(source.postMessage).toHaveBeenCalledTimes(3);

    source.postMessage.mockClear();
    handleStorage({ key: 'auth-store', newValue: persisted('export-2') });
    expect(source.postMessage).toHaveBeenCalledTimes(1);
  });
});
