import { describe, expect, it } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import {
  isPaykitSetupReadyMessage,
  PAYKIT_SETUP_MESSAGE_TYPE,
  PAYKIT_SETUP_READY_MESSAGE_TYPE,
  readPaykitSetupBridgeMessage,
} from './usePaykitSetupFlow.utils';

const PAYKIT_ORIGIN = 'https://paykit.example';
const iframeWindow = asOpaque<Window>({ name: 'iframe' });
const successData = { type: PAYKIT_SETUP_MESSAGE_TYPE, state: 'STATE' };

const makeEvent = (over: Partial<{ origin: string; source: Window | null; data: unknown }>): MessageEvent =>
  asOpaque<MessageEvent>({
    origin: 'origin' in over ? over.origin : PAYKIT_ORIGIN,
    source: 'source' in over ? over.source : iframeWindow,
    data: 'data' in over ? over.data : successData,
  });

describe('readPaykitSetupBridgeMessage', () => {
  it('returns {state} for a valid message from the Paykit iframe', () => {
    expect(readPaykitSetupBridgeMessage(makeEvent({}), iframeWindow, PAYKIT_ORIGIN)).toEqual({ state: 'STATE' });
  });

  it('returns {state, error} for a failure message', () => {
    const data = { type: PAYKIT_SETUP_MESSAGE_TYPE, state: 'STATE', error: 'setup-failed' };
    expect(readPaykitSetupBridgeMessage(makeEvent({ data }), iframeWindow, PAYKIT_ORIGIN)).toEqual({
      state: 'STATE',
      error: 'setup-failed',
    });
  });

  it('rejects a message from an origin other than Paykit', () => {
    expect(
      readPaykitSetupBridgeMessage(makeEvent({ origin: window.location.origin }), iframeWindow, PAYKIT_ORIGIN),
    ).toBeNull();
    expect(
      readPaykitSetupBridgeMessage(makeEvent({ origin: 'https://evil.example' }), iframeWindow, PAYKIT_ORIGIN),
    ).toBeNull();
  });

  it('rejects a message from a window other than the expected iframe', () => {
    const otherWindow = asOpaque<Window>({ name: 'other' });
    expect(readPaykitSetupBridgeMessage(makeEvent({ source: otherWindow }), iframeWindow, PAYKIT_ORIGIN)).toBeNull();
  });

  it('rejects a message when the expected iframe source is missing', () => {
    expect(readPaykitSetupBridgeMessage(makeEvent({}), null, PAYKIT_ORIGIN)).toBeNull();
  });

  it('treats a blank or non-string error as no error', () => {
    for (const error of ['', 0, null, {}]) {
      expect(
        readPaykitSetupBridgeMessage(
          makeEvent({ data: { type: PAYKIT_SETUP_MESSAGE_TYPE, state: 'STATE', error } }),
          iframeWindow,
          PAYKIT_ORIGIN,
        ),
      ).toEqual({ state: 'STATE' });
    }
  });

  it('rejects payloads that do not match the schema', () => {
    const cases: unknown[] = [
      null,
      'string-payload',
      { type: 'other-callback', state: 'STATE' },
      { type: PAYKIT_SETUP_MESSAGE_TYPE },
      { type: PAYKIT_SETUP_MESSAGE_TYPE, state: '' },
    ];
    for (const data of cases) {
      expect(readPaykitSetupBridgeMessage(makeEvent({ data }), iframeWindow, PAYKIT_ORIGIN)).toBeNull();
    }
  });
});

describe('isPaykitSetupReadyMessage', () => {
  const readyData = { type: PAYKIT_SETUP_READY_MESSAGE_TYPE, state: 'STATE' };

  it('accepts the ready report for this flow from the Paykit iframe', () => {
    expect(isPaykitSetupReadyMessage(makeEvent({ data: readyData }), iframeWindow, PAYKIT_ORIGIN, 'STATE')).toBe(true);
  });

  it('rejects a ready report from another origin or window', () => {
    const fromElsewhere = makeEvent({ data: readyData, origin: 'https://evil.example' });
    expect(isPaykitSetupReadyMessage(fromElsewhere, iframeWindow, PAYKIT_ORIGIN, 'STATE')).toBe(false);
    const otherWindow = makeEvent({ data: readyData, source: asOpaque<Window>({ name: 'other' }) });
    expect(isPaykitSetupReadyMessage(otherWindow, iframeWindow, PAYKIT_ORIGIN, 'STATE')).toBe(false);
    expect(isPaykitSetupReadyMessage(makeEvent({ data: readyData }), null, PAYKIT_ORIGIN, 'STATE')).toBe(false);
  });

  it('rejects a ready report for another state, or with no flow running', () => {
    expect(isPaykitSetupReadyMessage(makeEvent({ data: readyData }), iframeWindow, PAYKIT_ORIGIN, 'OTHER')).toBe(false);
    expect(isPaykitSetupReadyMessage(makeEvent({ data: readyData }), iframeWindow, PAYKIT_ORIGIN, null)).toBe(false);
  });

  it('rejects the callback and non-object data', () => {
    expect(isPaykitSetupReadyMessage(makeEvent({ data: successData }), iframeWindow, PAYKIT_ORIGIN, 'STATE')).toBe(
      false,
    );
    expect(
      isPaykitSetupReadyMessage(makeEvent({ data: 'paykit-setup-ready' }), iframeWindow, PAYKIT_ORIGIN, 'STATE'),
    ).toBe(false);
  });
});
