import { describe, expect, it } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import { LOCKS_AUTH_MESSAGE_TYPE, readLocksAuthBridgeMessage } from './useLocksAuthFlow.utils';

const LOCK_SERVER_ORIGIN = 'https://lock-server.example';
const iframeWindow = asOpaque<Window>({ name: 'iframe' });
const successData = { type: LOCKS_AUTH_MESSAGE_TYPE, code: 'CODE', state: 'STATE' };

const makeEvent = (over: Partial<{ origin: string; source: Window | null; data: unknown }>): MessageEvent =>
  asOpaque<MessageEvent>({
    origin: 'origin' in over ? over.origin : LOCK_SERVER_ORIGIN,
    source: 'source' in over ? over.source : iframeWindow,
    data: 'data' in over ? over.data : successData,
  });

describe('readLocksAuthBridgeMessage', () => {
  it('returns {code, state} for a valid message from the lock server iframe', () => {
    expect(readLocksAuthBridgeMessage(makeEvent({}), iframeWindow, LOCK_SERVER_ORIGIN)).toEqual({
      code: 'CODE',
      state: 'STATE',
    });
  });

  it('returns {error} for a failure message', () => {
    const data = { type: LOCKS_AUTH_MESSAGE_TYPE, error: 'connect-failed-410' };
    expect(readLocksAuthBridgeMessage(makeEvent({ data }), iframeWindow, LOCK_SERVER_ORIGIN)).toEqual({
      error: 'connect-failed-410',
    });
  });

  it('rejects a message from an origin other than the lock server', () => {
    expect(
      readLocksAuthBridgeMessage(makeEvent({ origin: window.location.origin }), iframeWindow, LOCK_SERVER_ORIGIN),
    ).toBeNull();
    expect(
      readLocksAuthBridgeMessage(makeEvent({ origin: 'https://evil.example' }), iframeWindow, LOCK_SERVER_ORIGIN),
    ).toBeNull();
  });

  it('rejects a message from a window other than the expected iframe', () => {
    const otherWindow = asOpaque<Window>({ name: 'other' });
    expect(readLocksAuthBridgeMessage(makeEvent({ source: otherWindow }), iframeWindow, LOCK_SERVER_ORIGIN)).toBeNull();
  });

  it('rejects a message when the expected iframe source is missing', () => {
    expect(readLocksAuthBridgeMessage(makeEvent({ source: null }), null, LOCK_SERVER_ORIGIN)).toBeNull();
  });

  it('rejects a wrong message type', () => {
    const data = { type: 'other', code: 'CODE', state: 'STATE' };
    expect(readLocksAuthBridgeMessage(makeEvent({ data }), iframeWindow, LOCK_SERVER_ORIGIN)).toBeNull();
  });

  it('rejects a success payload missing code or state', () => {
    expect(
      readLocksAuthBridgeMessage(
        makeEvent({ data: { type: LOCKS_AUTH_MESSAGE_TYPE, state: 'STATE' } }),
        iframeWindow,
        LOCK_SERVER_ORIGIN,
      ),
    ).toBeNull();
    expect(
      readLocksAuthBridgeMessage(
        makeEvent({ data: { type: LOCKS_AUTH_MESSAGE_TYPE, code: '', state: 'STATE' } }),
        iframeWindow,
        LOCK_SERVER_ORIGIN,
      ),
    ).toBeNull();
    expect(
      readLocksAuthBridgeMessage(
        makeEvent({ data: { type: LOCKS_AUTH_MESSAGE_TYPE } }),
        iframeWindow,
        LOCK_SERVER_ORIGIN,
      ),
    ).toBeNull();
  });

  it('rejects non-object data', () => {
    expect(readLocksAuthBridgeMessage(makeEvent({ data: 'string' }), iframeWindow, LOCK_SERVER_ORIGIN)).toBeNull();
    expect(readLocksAuthBridgeMessage(makeEvent({ data: null }), iframeWindow, LOCK_SERVER_ORIGIN)).toBeNull();
  });
});
